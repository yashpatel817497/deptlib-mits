"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Send } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows, Pill, Spinner } from "@/components/ui";
import type { DepartmentDTO, PublicUser, RequestDTO } from "@/lib/types";

export function RequestsTab({
  user,
  onChanged,
  refreshKey,
}: {
  user: PublicUser;
  onChanged: () => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const departments = useFetch<{ departments: DepartmentDTO[] }>("/api/departments");
  const requests = useFetch<{ requests: RequestDTO[] }>("/api/student/requests");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void requests.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (!deptId && departments.data?.departments?.length) {
      const own = departments.data.departments.find((dept) => dept.deptName === user.departmentName);
      setDeptId(String(own?.deptId ?? departments.data.departments[0].deptId));
    }
  }, [departments.data, deptId, user.departmentName]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/student/request", {
        method: "POST",
        body: JSON.stringify({ title, author, deptId: Number(deptId) }),
      });
      toast.success(result.message);
      setTitle("");
      setAuthor("");
      await requests.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  const list = requests.data?.requests ?? [];

  return (
    <div className="two-col">
      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <ClipboardList size={17} /> My book requests
            </div>
            <div className="section-desc">Requests are reviewed by the librarian.</div>
          </div>
        </div>

        {requests.loading && <LoadingRows rows={3} />}
        {!requests.loading && list.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={24} />}
            title="No requests yet"
            description="Cannot find a title? Ask the library to add it."
          />
        )}

        <div className="stack" style={{ gap: 10 }}>
          {list.map((request) => (
            <div key={request.requestId} className="notice-item" style={{ alignItems: "flex-start" }}>
              <span className="notice-icon">
                <ClipboardList size={16} />
              </span>
              <div style={{ flex: 1 }}>
                <div className="inline" style={{ justifyContent: "space-between", width: "100%" }}>
                  <strong style={{ fontSize: 13.5 }}>{request.title}</strong>
                  <Pill status={request.status} />
                </div>
                <div className="meta">
                  {request.author} · {request.departmentName} · requested{" "}
                  {fmtDate(request.createdAt)}
                </div>
                {request.reviewNote && (
                  <div className="meta" style={{ color: "var(--ink)" }}>
                    Librarian note: {request.reviewNote}
                  </div>
                )}
                {request.resolvedAt && (
                  <div className="meta">Reviewed {fmtDateTime(request.resolvedAt)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Send size={17} /> Request a new book
            </div>
            <div className="section-desc">Suggest a title for your department.</div>
          </div>
        </div>
        <form onSubmit={submit} className="stack" style={{ gap: 13 }}>
          <div className="field">
            <label htmlFor="req-title">Book title</label>
            <input
              id="req-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Hands-On Machine Learning"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="req-author">Author</label>
            <input
              id="req-author"
              className="input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="e.g. Aurélien Géron"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="req-dept">Department</label>
            <select
              id="req-dept"
              className="select"
              value={deptId}
              onChange={(event) => setDeptId(event.target.value)}
              required
            >
              {(departments.data?.departments ?? []).map((dept) => (
                <option key={dept.deptId} value={dept.deptId}>
                  {dept.deptName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? <Spinner white /> : <Send size={15} />} Submit request
          </button>
          <p className="hint">
            Approved requests are added to the catalogue automatically, ready to issue.
          </p>
        </form>
      </section>
    </div>
  );
}
