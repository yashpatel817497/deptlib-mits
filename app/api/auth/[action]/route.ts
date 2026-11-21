import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { fail, ok, parseBody, text } from "@/lib/api";
import {
  attachSession,
  clearSession,
  getSessionUser,
  publicUserFor,
} from "@/lib/auth";
import { Admin, User } from "@/lib/domain";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ action: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { action } = await params;
  try {
    if (action === "me") {
      const user = await getSessionUser();
      return ok({ user: user ? await publicUserFor(user) : null });
    }
    if (action === "setup-status") {
      const needsSetup = (await Admin.count()) === 0;
      return ok({ needsSetup, registrationOpen: needsSetup });
    }
    throw new AppError("Unknown auth action.", 404);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { action } = await params;
  try {
    if (action === "login") {
      const body = await parseBody<{ username?: string; password?: string }>(request);
      const username = text(body.username).trim();
      const password = text(body.password);
      if (!username || !password) throw new AppError("Enter your username and password.");

      const user = await User.findByUsername(username);
      if (!user) throw new AppError("Incorrect username or password.", 401);
      await user.login(password);

      const response = NextResponse.json({ user: await publicUserFor(user) });
      return await attachSession(response, user.id, request);
    }

    if (action === "register") {
      const body = await parseBody<{ username?: string; password?: string; role?: string }>(request);
      const role = text(body.role) || "Student";

      // Public sign-up is only for the very first administrator.
      if (role === "Student") {
        throw new AppError(
          "Student accounts are created by an administrator. Please ask the librarian for access.",
          403
        );
      }
      if (role !== "Admin") {
        throw new AppError("Choose a valid account type.");
      }
      if ((await Admin.count()) > 0) {
        throw new AppError(
          "Public sign-up is disabled. Please ask an administrator to create your account.",
          403
        );
      }

      const admin = await Admin.createAccount({
        username: text(body.username),
        password: text(body.password),
      });
      const response = NextResponse.json(
        {
          user: admin.toPublic(),
          message: "Administrator account created. Public sign-up is now disabled.",
        },
        { status: 201 }
      );
      return await attachSession(response, admin.id, request);
    }

    if (action === "logout") {
      const user = await getSessionUser();
      await user?.logout();
      const response = NextResponse.json({ ok: true });
      return clearSession(response, request);
    }

    throw new AppError("Unknown auth action.", 404);
  } catch (error) {
    return fail(error);
  }
}
