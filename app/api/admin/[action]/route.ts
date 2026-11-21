import { NextResponse } from "next/server";
import { fail, ok, parseBody, text, toId } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { downloadHeaders, tablesToCSV, toCSV } from "@/lib/csv";
import { PaymentGateway } from "@/lib/domain";
import type { Admin } from "@/lib/domain";
import { AppError } from "@/lib/errors";
import type { RequestStatus, UserStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ action: string }> };

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function reportCSV(admin: Admin): Promise<string> {
  const report = await admin.generateReport();
  const summary = Object.entries(report.totals).map(([metric, value]) => ({ metric, value }));
  const departments = report.departments.map((dept) => ({
    department: dept.deptName,
    books: dept.books,
    issued: dept.issued,
  }));
  const overdue = report.overdue.map((loan) => ({
    student: loan.studentName,
    book: loan.title,
    due_date: loan.dueDate,
    days_overdue: loan.daysOverdue,
    fine: loan.fineIfReturnedToday,
  }));
  return [
    `# LIBRARY SUMMARY REPORT (generated ${new Date().toISOString()})`,
    toCSV(summary),
    "",
    "# DEPARTMENT BREAKDOWN",
    toCSV(departments),
    "",
    "# OVERDUE LOANS",
    overdue.length ? toCSV(overdue) : "# (none)",
    "",
  ].join("\r\n");
}

export async function GET(request: Request, { params }: Params) {
  const { action } = await params;
  try {
    const admin = await requireAdmin();
    const url = new URL(request.url);

    switch (action) {
      case "report": {
        if (url.searchParams.get("format") === "csv") {
          return new NextResponse(await reportCSV(admin), {
            headers: downloadHeaders(`library-report-${stamp()}.csv`, "text/csv; charset=utf-8"),
          });
        }
        return ok({ report: await admin.generateReport() });
      }
      case "students":
        return ok({ students: await admin.getStudents() });
      case "requests":
        return ok({ requests: await admin.getRequests() });
      case "issue-requests":
        return ok({ requests: await admin.getIssueRequests() });
      case "circulation":
        return ok({ loans: await admin.getCirculation() });
      case "payments":
        return ok({ payments: await PaymentGateway.all() });
      case "history":
        return ok({ history: await admin.checkHistory() });
      case "backup": {
        const backup = await admin.backupDatabase();
        const format = url.searchParams.get("format") ?? "json";
        if (format === "csv") {
          return new NextResponse(tablesToCSV(backup.tables), {
            headers: downloadHeaders(`library-backup-${stamp()}.csv`, "text/csv; charset=utf-8"),
          });
        }
        return new NextResponse(JSON.stringify(backup, null, 2), {
          headers: downloadHeaders(`library-backup-${stamp()}.json`, "application/json"),
        });
      }
      default:
        throw new AppError("Unknown admin action.", 404);
    }
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { action } = await params;
  try {
    const admin = await requireAdmin();

    switch (action) {
      case "book": {
        const body = await parseBody<{
          title?: string;
          author?: string;
          deptId?: number;
          replacementCost?: number;
          copies?: number;
        }>(request);
        const book = await admin.addNewBook({
          title: text(body.title),
          author: text(body.author),
          deptId: toId(body.deptId, "department"),
          replacementCost: body.replacementCost ? Number(body.replacementCost) : undefined,
          copies: body.copies !== undefined ? Number(body.copies) : undefined,
        });
        return ok({ book, message: `"${book.title}" added to the catalogue.` }, 201);
      }
      case "department": {
        const body = await parseBody<{ deptName?: string }>(request);
        const department = await admin.addNewDepartment(text(body.deptName));
        return ok({ department, message: `Department "${department.deptName}" created.` }, 201);
      }
      case "announcement": {
        const body = await parseBody<{ message?: string }>(request);
        const announcement = await admin.broadcastAnnouncement(text(body.message));
        return ok({ announcement, message: "Announcement published to all students." }, 201);
      }
      case "student-status": {
        const body = await parseBody<{ studentId?: number; status?: UserStatus }>(request);
        const status = body.status;
        if (status !== "Active" && status !== "Suspended") {
          throw new AppError("Status must be Active or Suspended.");
        }
        const student = await admin.manageUserStatus(toId(body.studentId, "student"), status);
        return ok({
          student,
          message: `${student.username} is now ${status.toLowerCase()}.`,
        });
      }
      case "edit-student": {
        const body = await parseBody<{
          studentId?: number;
          fullName?: string;
          enrollmentNo?: string;
          departmentName?: string;
          semester?: string;
          email?: string;
          phone?: string;
          status?: UserStatus;
        }>(request);
        const student = await admin.updateStudentDetails(toId(body.studentId, "student"), {
          fullName: body.fullName !== undefined ? text(body.fullName) : undefined,
          enrollmentNo: body.enrollmentNo !== undefined ? text(body.enrollmentNo) : undefined,
          departmentName:
            body.departmentName !== undefined ? text(body.departmentName) : undefined,
          semester: body.semester !== undefined ? text(body.semester) : undefined,
          email: body.email !== undefined ? text(body.email) : undefined,
          phone: body.phone !== undefined ? text(body.phone) : undefined,
          status: body.status,
        });
        return ok({
          student,
          message: `Details updated for ${student.fullName || student.username}.`,
        });
      }
      case "register-student": {
        const body = await parseBody<{
          fullName?: string;
          enrollmentNo?: string;
          email?: string;
          departmentName?: string;
          semester?: string;
          username?: string;
          password?: string;
        }>(request);
        const created = await admin.registerStudent({
          fullName: text(body.fullName),
          enrollmentNo: text(body.enrollmentNo),
          email: text(body.email),
          departmentName: text(body.departmentName),
          semester: text(body.semester),
          username: text(body.username),
          password: text(body.password),
        });
        return ok(created, 201);
      }
      case "issue-request": {
        const body = await parseBody<{
          requestId?: number;
          status?: "Approved" | "Rejected";
          note?: string;
        }>(request);
        if (body.status !== "Approved" && body.status !== "Rejected") {
          throw new AppError("Request status must be Approved or Rejected.");
        }
        const resolved = await admin.resolveIssueRequest(
          toId(body.requestId, "request"),
          body.status,
          text(body.note)
        );
        return ok({
          request: resolved,
          message:
            body.status === "Approved"
              ? `Approved — "${resolved.title}" issued to ${resolved.studentName}.`
              : `Rejected the issue request for "${resolved.title}".`,
        });
      }
      case "reset-student": {
        const body = await parseBody<{ studentId?: number }>(request);
        return ok(await admin.resetStudentAccount(toId(body.studentId, "student")));
      }
      case "resolve-request": {
        const body = await parseBody<{
          requestId?: number;
          status?: RequestStatus;
          note?: string;
          copies?: number;
        }>(request);
        if (body.status !== "Approved" && body.status !== "Rejected") {
          throw new AppError("Request status must be Approved or Rejected.");
        }
        const resolved = await admin.resolveRequest(
          toId(body.requestId, "request"),
          body.status,
          text(body.note),
          body.copies !== undefined ? Number(body.copies) : 1
        );
        return ok({ request: resolved, message: `Request ${body.status.toLowerCase()}.` });
      }
      case "student": {
        const body = await parseBody<{
          username?: string;
          password?: string;
          departmentName?: string;
        }>(request);
        const student = await admin.createStudentAccount({
          username: text(body.username),
          password: text(body.password),
          departmentName: text(body.departmentName),
        });
        return ok(
          { student, message: `Student account "${student.username}" created.` },
          201
        );
      }
      case "new-admin": {
        const body = await parseBody<{ username?: string; password?: string }>(request);
        const created = await admin.createAdminAccount({
          username: text(body.username),
          password: text(body.password),
        });
        return ok({ admin: created, message: "Administrator account created." }, 201);
      }
      default:
        throw new AppError("Unknown admin action.", 404);
    }
  } catch (error) {
    return fail(error);
  }
}
