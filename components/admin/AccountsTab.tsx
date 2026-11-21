"use client";

import { useEffect, useState } from "react";
import { GraduationCap, ShieldCheck, UserPlus } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { Spinner } from "@/components/ui";
import type { DepartmentDTO } from "@/lib/types";

interface StudentForm {
  username: string;
  password: string;
  confirm: string;
  departmentName: string;
}

interface AdminForm {
  username: string;
  password: string;
  confirm: string;
}

const EMPTY_STUDENT: StudentForm = {
  username: "",
  password: "",
  confirm: "",
  departmentName: "",
};

const EMPTY_ADMIN: AdminForm = { username: "", password: "", confirm: "" };

export function AccountsTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const departments = useFetch<{ departments: DepartmentDTO[] }>("/api/departments");
  const [studentForm, setStudentForm] = useState<StudentForm>(EMPTY_STUDENT);
  const [adminForm, setAdminForm] = useState<AdminForm>(EMPTY_ADMIN);
  const [busy, setBusy] = useState<"student" | "admin" | null>(null);

  useEffect(() => {
    if (!studentForm.departmentName && departments.data?.departments?.length) {
      setStudentForm((current) => ({
        ...current,
        departmentName: departments.data!.departments[0].deptName,
      }));
    }
  }, [departments.data, studentForm.departmentName]);

  async function createStudent(event: React.FormEvent) {
    event.preventDefault();
    if (studentForm.password !== studentForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy("student");
    try {
      const result = await api<{ message: string }>("/api/admin/student", {
        method: "POST",
        body: JSON.stringify({
          username: studentForm.username,
          password: studentForm.password,
          departmentName: studentForm.departmentName,
        }),
      });
      toast.success(result.message);
      setStudentForm({ ...EMPTY_STUDENT, departmentName: studentForm.departmentName });
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not create the student account.");
    } finally {
      setBusy(null);
    }
  }

  async function createAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (adminForm.password !== adminForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy("admin");
    try {
      const result = await api<{ message: string }>("/api/admin/new-admin", {
        method: "POST",
        body: JSON.stringify({
          username: adminForm.username,
          password: adminForm.password,
        }),
      });
      toast.success(result.message);
      setAdminForm(EMPTY_ADMIN);
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Could not create the administrator account."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="alert info">
        <ShieldCheck size={16} />
        <span>
          Only signed-in administrators can create accounts. Public sign-up is disabled once the
          first admin exists, and every new account can sign in immediately.
        </span>
      </div>

      <div className="grid cols-2">
        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">
                <GraduationCap size={17} /> New student account
              </div>
              <div className="section-desc">
                Set a username, password and the student&apos;s department.
              </div>
            </div>
          </div>

          <form onSubmit={createStudent} className="stack" style={{ gap: 13 }}>
            <div className="field">
              <label htmlFor="student-username">Username</label>
              <input
                id="student-username"
                className="input"
                value={studentForm.username}
                onChange={(event) =>
                  setStudentForm((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="e.g. ananya.rao"
                autoComplete="off"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="student-department">Department</label>
              <select
                id="student-department"
                className="select"
                value={studentForm.departmentName}
                onChange={(event) =>
                  setStudentForm((current) => ({
                    ...current,
                    departmentName: event.target.value,
                  }))
                }
                required
              >
                {(departments.data?.departments ?? []).map((dept) => (
                  <option key={dept.deptId} value={dept.deptName}>
                    {dept.deptName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="student-password">Password</label>
              <input
                id="student-password"
                className="input"
                type="password"
                value={studentForm.password}
                onChange={(event) =>
                  setStudentForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="student-confirm">Confirm password</label>
              <input
                id="student-confirm"
                className="input"
                type="password"
                value={studentForm.confirm}
                onChange={(event) =>
                  setStudentForm((current) => ({ ...current, confirm: event.target.value }))
                }
                placeholder="Re-enter the password"
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className="btn primary" disabled={busy !== null}>
              {busy === "student" ? <Spinner white /> : <UserPlus size={15} />} Create student
            </button>
          </form>
        </section>

        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">
                <ShieldCheck size={17} /> New administrator account
              </div>
              <div className="section-desc">
                Additional librarians get full access to this console.
              </div>
            </div>
          </div>

          <form onSubmit={createAdmin} className="stack" style={{ gap: 13 }}>
            <div className="field">
              <label htmlFor="admin-username">Username</label>
              <input
                id="admin-username"
                className="input"
                value={adminForm.username}
                onChange={(event) =>
                  setAdminForm((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="e.g. librarian.rao"
                autoComplete="off"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                className="input"
                type="password"
                value={adminForm.password}
                onChange={(event) =>
                  setAdminForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="admin-confirm">Confirm password</label>
              <input
                id="admin-confirm"
                className="input"
                type="password"
                value={adminForm.confirm}
                onChange={(event) =>
                  setAdminForm((current) => ({ ...current, confirm: event.target.value }))
                }
                placeholder="Re-enter the password"
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className="btn secondary" disabled={busy !== null}>
              {busy === "admin" ? <Spinner /> : <ShieldCheck size={15} />} Create administrator
            </button>
            <p className="hint">
              All passwords are salted and hashed with scrypt before being stored.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
