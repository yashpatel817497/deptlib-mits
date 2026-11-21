import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { one, run } from "./db";
import { AppError } from "./errors";
import type { Role } from "./types";
import { Admin, Student, User } from "./domain";

export const SESSION_COOKIE = "dlms_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const globalForSecret = globalThis as unknown as { __dlmsSecret?: string };

async function sessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (globalForSecret.__dlmsSecret) return globalForSecret.__dlmsSecret;

  const existing = await one<{ value: string }>(
    "SELECT value FROM app_secrets WHERE key = 'session_secret'"
  );
  if (existing?.value) {
    globalForSecret.__dlmsSecret = existing.value;
    return existing.value;
  }

  const secret = randomBytes(32).toString("hex");
  await run(
    "INSERT OR IGNORE INTO app_secrets (key, value) VALUES ('session_secret', ?)",
    secret
  );
  const saved = await one<{ value: string }>(
    "SELECT value FROM app_secrets WHERE key = 'session_secret'"
  );
  const resolved = saved?.value ?? secret;
  globalForSecret.__dlmsSecret = resolved;
  return resolved;
}

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("base64url");
}

export async function createSessionToken(userId: number): Promise<string> {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MAX_AGE * 1000 })
  ).toString("base64url");
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string): Promise<number | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = await sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: number;
      exp?: number;
    };
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  return User.findById(userId);
}

export async function requireUser(role?: Role): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AppError("Please sign in to continue.", 401);
  if (role && user.role !== role) throw new AppError("You do not have access to this resource.", 403);
  if (user.status === "Suspended") {
    throw new AppError("This account is suspended. Please contact the librarian.", 403);
  }
  return user;
}

export async function requireAdmin(): Promise<Admin> {
  return Admin.hydrate(await requireUser("Admin"));
}

export async function requireStudent(): Promise<Student> {
  return Student.hydrate(await requireUser("Student"));
}

function cookiePolicy(request?: Request): { secure: boolean; sameSite: "lax" | "none" } {
  if (!request) {
    return { secure: process.env.NODE_ENV === "production", sameSite: "lax" };
  }
  const forwarded = (request.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const secure = forwarded ? forwarded === "https" : new URL(request.url).protocol === "https:";
  // The hosted dev preview embeds the app in a cross-site iframe, where a Lax cookie
  // is never sent back. Match the platform preview cookie there; keep Lax elsewhere.
  const host = (request.headers.get("host") ?? new URL(request.url).host).toLowerCase();
  const embeddedPreview = secure && /(^|\.)style\.dev$/.test(host);
  return { secure, sameSite: embeddedPreview ? "none" : "lax" };
}

export async function attachSession(
  response: NextResponse,
  userId: number,
  request?: Request
): Promise<NextResponse> {
  const { secure, sameSite } = cookiePolicy(request);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(userId),
    httpOnly: true,
    sameSite,
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure,
  });
  return response;
}

export function clearSession(response: NextResponse, request?: Request): NextResponse {
  const { secure, sameSite } = cookiePolicy(request);
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite,
    path: "/",
    maxAge: 0,
    secure,
  });
  return response;
}

export async function publicUserFor(user: User) {
  if (user.role === "Admin") {
    const admin = await Admin.findByUserId(user.id);
    if (admin) return admin.toPublic();
  }
  if (user.role === "Student") {
    const student = await Student.findByUserId(user.id);
    if (student) return student.toPublic();
  }
  return user.toPublic();
}
