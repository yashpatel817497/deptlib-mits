import { fail, ok, parseBody, text } from "@/lib/api";
import { requireAdmin, requireUser } from "@/lib/auth";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const announcements = (
      await all<{
        announcement_id: number;
        message: string;
        author: string;
        created_at: string;
      }>("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50")
    ).map((row) => ({
      announcementId: row.announcement_id,
      message: row.message,
      author: row.author,
      createdAt: row.created_at,
    }));
    return ok({ announcements });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await parseBody<{ message?: string }>(request);
    const announcement = await admin.broadcastAnnouncement(text(body.message));
    return ok({ announcement, message: "Announcement published to all students." }, 201);
  } catch (error) {
    return fail(error);
  }
}
