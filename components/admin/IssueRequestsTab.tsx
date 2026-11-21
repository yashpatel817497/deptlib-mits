"use client";

import { useState } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows, Pill } from "@/components/ui";
import type { IssueRequestDTO } from "@/lib/types";

export function IssueRequestsTab({
  requests,
  loading,
  onChanged,
}: {
  requests: IssueRequestDTO[];
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function resolve(request: IssueRequestDTO, status: "Approved" | "Rejected") {
    setBusyId(request.requestId);
    try {
      const result = await api<{ message: string }>("/api/admin/issue-request", {
        method: "POST",
        body: JSON.stringify({ requestId: request.requestId, status }),
      });
      toast.success(result.message);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the request.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((request) => request.status === "Pending").length;
  const waiting = requests.filter((request) => request.status === "Pending");
  const resolved = requests.filter((request) => request.status !== "Pending");

  return (
    <section className="card card-pad">
      <div className="section-head">
        <div>
          <div className="section-title">
            <ClipboardCheck size={17} /> Issue requests
            {pending > 0 ? <span className="menu-count">{pending}</span> : null}
          </div>
          <div className="section-desc">
            {pending === 0
              ? "No requests waiting. Student requests appear here before any copy leaves the shelf."
              : `${pending} ${pending === 1 ? "request is" : "requests are"} waiting for your approval.`}
          </div>
        </div>
      </div>

      {loading && <LoadingRows rows={3} />}
      {!loading && requests.length === 0 && (
        <EmptyState
          icon={<ClipboardCheck size={24} />}
          title="No issue requests yet"
          description="When a student requests a book, it will wait here until you approve or reject it."
        />
      )}

      <div className="stack" style={{ gap: 12 }}>
        {[...waiting, ...resolved].map((request) => {
          const isPending = request.status === "Pending";
          const outOfStock = request.availableCopies <= 0;
          return (
            <div key={request.requestId} className="request-card">
              <div className="r-info">
                <div className="inline" style={{ gap: 10 }}>
                  <h4>{request.title}</h4>
                  <Pill status={request.status} />
                </div>
                <div className="r-meta">
                  {request.author} · {request.bookDepartment} · Book #
                  {String(request.bookId).padStart(4, "0")}
                </div>
                <div className="r-meta" style={{ marginTop: 4 }}>
                  Requested by <strong>{request.fullName || request.studentName}</strong>
                  {request.enrollmentNo ? ` · ${request.enrollmentNo}` : ""}
                  {` · ${request.departmentName}`}
                  {request.semester ? ` · ${request.semester}` : ""}
                  {` · @${request.studentName}`}
                </div>
                <div className="r-meta" style={{ marginTop: 4 }}>
                  {fmtDateTime(request.createdAt)} ·{" "}
                  <span style={{ color: outOfStock ? "var(--danger)" : "var(--ink)" }}>
                    {request.availableCopies} available now
                  </span>
                </div>
                {request.availableCopies === 0 && isPending && (
                  <div className="r-meta" style={{ color: "var(--danger)", marginTop: 4 }}>
                    Every copy is on loan — restock the title or reject this request.
                  </div>
                )}
              </div>
              {isPending && (
                <div className="actions">
                  <button
                    type="button"
                    className="btn success sm"
                    disabled={busyId === request.requestId || outOfStock}
                    onClick={() => resolve(request, "Approved")}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    className="btn danger sm"
                    disabled={busyId === request.requestId}
                    onClick={() => resolve(request, "Rejected")}
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
