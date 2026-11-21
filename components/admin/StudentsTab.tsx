"use client";

import { useEffect, useState } from "react";
import { Pencil, RotateCcw, Search, ShieldCheck, ShieldOff, UserPlus, Users } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDate, money } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows, Modal, Pill } from "@/components/ui";
import type { AdminStudentDTO, DepartmentDTO } from "@/lib/types";

interface StudentForm {
  fullName: string;
  enrollmentNo: string;
  departmentName: string;
  semester: string;
  email: string;
  phone: string;
  status: "Active" | "Suspended";
}

interface AddStudentForm {
  fullName: string;
  enrollmentNo: string;
  email: string;
  departmentName: string;
  semester: string;
  username: string;
  password: string;
}

const EMPTY_ADD_FORM: AddStudentForm = {
  fullName: "",
  enrollmentNo: "",
  email: "",
  departmentName: "",
  semester: "",
  username: "",
  password: "",
};

const EMPTY_FORM: StudentForm = {
  fullName: "",
  enrollmentNo: "",
  departmentName: "",
  semester: "",
  email: "",
  phone: "",
  status: "Active",
};

export function StudentsTab({
  onChanged,
  refreshKey,
}: {
  onChanged: () => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const students = useFetch<{ students: AdminStudentDTO[] }>("/api/admin/students");
  const departments = useFetch<{ departments: DepartmentDTO[] }>("/api/departments");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminStudentDTO | null>(null);
  const [resetting, setResetting] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminStudentDTO | null>(null);
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddStudentForm>(EMPTY_ADD_FORM);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void students.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const first = departments.data?.departments?.[0]?.deptName;
    if (addOpen && first) {
      setAddForm((current) =>
        current.departmentName ? current : { ...current, departmentName: first }
      );
    }
  }, [addOpen, departments.data]);

  async function toggleStatus(student: AdminStudentDTO) {
    setBusyId(student.studentId ?? student.id);
    try {
      const next = student.status === "Active" ? "Suspended" : "Active";
      const result = await api<{ message: string }>("/api/admin/student-status", {
        method: "POST",
        body: JSON.stringify({ studentId: student.studentId ?? student.id, status: next }),
      });
      toast.success(result.message);
      await students.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the student.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetAccount() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const result = await api<{ message: string }>("/api/admin/reset-student", {
        method: "POST",
        body: JSON.stringify({ studentId: resetTarget.studentId ?? resetTarget.id }),
      });
      toast.success(result.message);
      setResetTarget(null);
      await students.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not reset the account.");
    } finally {
      setResetting(false);
    }
  }

  function openAdd() {
    setAddForm({
      ...EMPTY_ADD_FORM,
      departmentName: departments.data?.departments?.[0]?.deptName ?? "",
    });
    setAddOpen(true);
  }

  async function createStudent(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await api<{ student: AdminStudentDTO; message: string }>(
        "/api/admin/register-student",
        { method: "POST", body: JSON.stringify(addForm) }
      );
      toast.success(result.message);
      setAddOpen(false);
      await students.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the student.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(student: AdminStudentDTO) {
    setEditTarget(student);
    setForm({
      fullName: student.fullName || student.username,
      enrollmentNo: student.enrollmentNo ?? "",
      departmentName: student.departmentName ?? "",
      semester: student.semester ?? "",
      email: student.email ?? "",
      phone: student.phone ?? "",
      status: student.status,
    });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    const target = editTarget;
    if (!target) return;
    setSaving(true);
    try {
      const result = await api<{ student: AdminStudentDTO; message: string }>(
        "/api/admin/edit-student",
        {
          method: "POST",
          body: JSON.stringify({
            studentId: target.studentId ?? target.id,
            ...form,
          }),
        }
      );
      toast.success(result.message);
      setEditTarget(null);
      await students.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the student.");
    } finally {
      setSaving(false);
    }
  }

  const list = students.data?.students ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? list.filter(
        (student) =>
          student.username.toLowerCase().includes(term) ||
          (student.departmentName ?? "").toLowerCase().includes(term) ||
          (student.fullName ?? "").toLowerCase().includes(term) ||
          (student.enrollmentNo ?? "").toLowerCase().includes(term) ||
          (student.email ?? "").toLowerCase().includes(term)
      )
    : list;

  return (
    <section className="card card-flush">
      <div className="card-pad" style={{ paddingBottom: 14 }}>
        <div className="section-head" style={{ marginBottom: 12 }}>
          <div>
            <div className="section-title">
              <Users size={17} /> Registered students ({list.length})
            </div>
            <div className="section-desc">
              Register students, edit a profile, suspend accounts to block borrowing, or reset fines
              and recall all loans.
            </div>
          </div>
          <button type="button" className="btn primary sm" onClick={openAdd}>
            <UserPlus size={14} /> Add Student
          </button>
        </div>
        <div className="search">
          <Search size={16} />
          <input
            className="input"
            placeholder="Search by name, username, enrollment number, email or department…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {students.loading && <LoadingRows rows={5} />}
      {!students.loading && filtered.length === 0 && (
        <EmptyState
          icon={<Users size={24} />}
          title="No students found"
          description="Students who register will appear here."
        />
      )}
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Department</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Loans</th>
                <th>Fine balance</th>
                <th>Fines paid</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => {
                const id = student.studentId ?? student.id;
                return (
                  <tr key={id}>
                    <td>
                      <div className="title-cell">{student.username}</div>
                      <div className="cell-sub">
                        {student.fullName || "No full name"}
                        {student.enrollmentNo ? ` · ${student.enrollmentNo}` : ""}
                        {` · ID #${id}`}
                      </div>
                    </td>
                    <td>
                      <span className="dept-chip">{student.departmentName}</span>
                      {student.semester ? <div className="cell-sub">{student.semester}</div> : null}
                    </td>
                    <td>
                      <div>{student.email || <span className="muted">No email</span>}</div>
                      {student.phone ? <div className="cell-sub">{student.phone}</div> : null}
                    </td>
                    <td>
                      <Pill status={student.status} />
                    </td>
                    <td>
                      {student.activeLoans}
                      {student.overdueLoans > 0 && (
                        <div className="cell-sub" style={{ color: "var(--danger)" }}>
                          {student.overdueLoans} overdue
                        </div>
                      )}
                    </td>
                    <td className="nowrap">
                      {money(student.fineBalance ?? 0)}
                    </td>
                    <td className="nowrap">{money(student.totalFinesPaid)}</td>
                    <td className="nowrap muted">{fmtDate(student.createdAt)}</td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => openEdit(student)}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className={`btn sm ${student.status === "Active" ? "danger" : "success"}`}
                          disabled={busyId === id}
                          onClick={() => toggleStatus(student)}
                        >
                          {student.status === "Active" ? (
                            <>
                              <ShieldOff size={13} /> Suspend
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={13} /> Activate
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => setResetTarget(student)}
                        >
                          <RotateCcw size={13} /> Reset
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(editTarget)}
        onClose={() => {
          if (!saving) setEditTarget(null);
        }}
        title={editTarget ? `Edit ${editTarget.username}` : "Edit student"}
        subtitle={editTarget ? `Student #${String(editTarget.studentId ?? editTarget.id).padStart(4, "0")}` : undefined}
        wide
        footer={
          <div className="form-row">
            <button
              type="button"
              className="btn secondary"
              disabled={saving}
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-student-form"
              className="btn primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        }
      >
        <form id="edit-student-form" onSubmit={saveEdit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="edit-student-name">Full name</label>
              <input
                id="edit-student-name"
                className="input"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-student-enrollment">Enrollment / roll number</label>
              <input
                id="edit-student-enrollment"
                className="input"
                value={form.enrollmentNo}
                onChange={(event) => setForm({ ...form, enrollmentNo: event.target.value })}
                placeholder="e.g. CS21B045"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-student-dept">Department</label>
              <select
                id="edit-student-dept"
                className="select"
                value={form.departmentName}
                onChange={(event) => setForm({ ...form, departmentName: event.target.value })}
                required
              >
                {(departments.data?.departments ?? []).map((dept) => (
                  <option key={dept.deptId} value={dept.deptName}>
                    {dept.deptName}
                  </option>
                ))}
                {!(departments.data?.departments ?? []).some(
                  (dept) => dept.deptName === form.departmentName
                ) && form.departmentName ? (
                  <option value={form.departmentName}>{form.departmentName}</option>
                ) : null}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-student-semester">Semester / year</label>
              <input
                id="edit-student-semester"
                className="input"
                value={form.semester}
                onChange={(event) => setForm({ ...form, semester: event.target.value })}
                placeholder="e.g. Semester 5"
                maxLength={20}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-student-email">Email</label>
              <input
                id="edit-student-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="student@college.edu"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-student-phone">Phone number</label>
              <input
                id="edit-student-phone"
                className="input"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="9876543210"
                inputMode="tel"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-student-status">Account status</label>
              <select
                id="edit-student-status"
                className="select"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as StudentForm["status"] })
                }
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            The login username, password, loans, reservations and fines stay exactly as they are.
          </p>
        </form>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => {
          if (!creating) setAddOpen(false);
        }}
        title="Add a student"
        subtitle="Create a Student portal account with login credentials"
        wide
        footer={
          <div className="form-row">
            <button
              type="button"
              className="btn secondary"
              disabled={creating}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-student-form"
              className="btn primary"
              disabled={creating}
            >
              {creating ? "Creating…" : "Create student"}
            </button>
          </div>
        }
      >
        <form id="add-student-form" onSubmit={createStudent}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="add-student-name">Full name</label>
              <input
                id="add-student-name"
                className="input"
                value={addForm.fullName}
                onChange={(event) => setAddForm({ ...addForm, fullName: event.target.value })}
                placeholder="e.g. Ananya Sharma"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-student-enrollment">Enrollment number</label>
              <input
                id="add-student-enrollment"
                className="input"
                value={addForm.enrollmentNo}
                onChange={(event) => {
                  const value = event.target.value;
                  setAddForm((current) => ({
                    ...current,
                    enrollmentNo: value,
                    username:
                      !current.username ||
                      current.username === current.enrollmentNo.trim().toLowerCase()
                        ? value.trim().toLowerCase()
                        : current.username,
                  }));
                }}
                placeholder="e.g. CS21B045"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-student-email">Email</label>
              <input
                id="add-student-email"
                className="input"
                type="email"
                value={addForm.email}
                onChange={(event) => setAddForm({ ...addForm, email: event.target.value })}
                placeholder="student@college.edu"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-student-dept">Department</label>
              <select
                id="add-student-dept"
                className="select"
                value={addForm.departmentName}
                onChange={(event) =>
                  setAddForm({ ...addForm, departmentName: event.target.value })
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
              <label htmlFor="add-student-semester">Semester / year</label>
              <input
                id="add-student-semester"
                className="input"
                value={addForm.semester}
                onChange={(event) => setAddForm({ ...addForm, semester: event.target.value })}
                placeholder="e.g. Semester 5"
                maxLength={20}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-student-username">Login username</label>
              <input
                id="add-student-username"
                className="input"
                value={addForm.username}
                onChange={(event) => setAddForm({ ...addForm, username: event.target.value })}
                placeholder="e.g. cs21b045"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="add-student-password">Temporary password</label>
              <input
                id="add-student-password"
                className="input"
                type="password"
                value={addForm.password}
                onChange={(event) => setAddForm({ ...addForm, password: event.target.value })}
                placeholder="At least 6 characters"
                minLength={6}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Share the username and temporary password with the student — they can sign in to the
            Student portal immediately and start requesting books.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => (resetting ? undefined : setResetTarget(null))}
        title="Reset student account"
        subtitle={resetTarget?.username}
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              disabled={resetting}
              onClick={() => setResetTarget(null)}
            >
              Cancel
            </button>
            <button type="button" className="btn danger" disabled={resetting} onClick={resetAccount}>
              {resetting ? "Resetting…" : "Reset account"}
            </button>
          </>
        }
      >
        <p className="muted" style={{ fontSize: 13.5 }}>
          This clears the outstanding fine balance, marks all active loans as returned, restores the
          books to the shelves and reactivates the account. Transaction history is kept for audit.
        </p>
      </Modal>
    </section>
  );
}
