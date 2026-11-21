import { NextResponse } from "next/server";
import { AppError } from "./errors";

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api]", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") throw new Error("body");
    return body as T;
  } catch {
    throw new AppError("Invalid request body.", 400);
  }
}

export function toNumber(value: unknown, field = "value"): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new AppError(`Invalid ${field}.`);
  return number;
}

export function toId(value: unknown, field = "id"): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new AppError(`Invalid ${field}.`);
  return number;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
