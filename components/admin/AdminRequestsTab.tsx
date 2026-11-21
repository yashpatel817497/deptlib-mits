"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardList, X } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows, Pill } from "@/components/ui";
import type { RequestDTO } from "@/lib/types";

export function AdminRequestsTab({
  onChanged,
  refreshKey,
}: {
  onChanged: () => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const requests = useFetch<{ requests: RequestDTO[] }>("/api/admin/requests");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [copies, setCopies] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    void requests.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function resolve(request: RequestDTO, status: "Approved" | "Rejected") {
    setBusyId(request.requestId);
    try {
      const result = await api<{ message: string }>("/api/admin/resolve-request", {
        method: "POST",
        body: JSON.stringify({
          requestId: request.requestId,
          status,
          note: notes[request.requestId] ?? "",
          copies: Number(copies[request.requestId] ?? 1),
        }),
      });
      toast.success(result.message);
      setNotes((current) => ({ ...current, [request.requestId]: "" }));
      await requests.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the request.");
    } finally {
      setBusyId(null);
    }
  }

  const list = requests.data?.requests ?? [];
  const pending = list.filter((request) => request.status === "Pending");

  return (
    <section className="card card-pad">
      <div className="section-head">
        <div>
          <div className="section-title">
            <ClipboardList size={17} /> New book requests
          </div>
          <div className="section-desc">
            {pending.length} pending · approving a request adds the book to the catalogue automatically.
          </div>
        </div>
      </div>

      {requests.loading && <LoadingRows rows={3} />}
      {!requests.loading && list.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="No requests yet"
          description="Student suggestions will appear here for review."
        />
      )}

      <div className="stack" style={{ gap: 12 }}>
        {list.map((request) => {
          const isPending = request.status === "Pending";
          return (
            <div key={request.requestId} className="request-card">
              <div className="r-info">
                <div className="inline" style={{ gap: 10 }}>
                  <h4>{request.title}</h4>
                  <Pill status={request.status} />
                </div>
                <div className="r-meta">
                  {request.author} · {request.departmentName} · requested by{" "}
                  {request.studentName} on {fmtDate(request.createdAt)}
                </div>
                {request.reviewNote && (
                  <div className="r-meta" style={{ color: "var(--ink)", marginTop: 6 }}>
                    Note: {request.reviewNote}
                  </div>
                )}
                {isPending && (
                  <div className="form-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                    <label className="inline tiny muted" htmlFor={`copies-${request.requestId}`}>
                      Copies
                      <input
                        id={`copies-${request.requestId}`}
                        className="input"
                        type="number"
                        min={1}
                        max={99}
                        style={{ width: 84 }}
                        value={copies[request.requestId] ?? "1"}
                        onChange={(event) =>
                          setCopies((current) => ({
                            ...current,
                            [request.requestId]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <input
                      className="input"
                      style={{ maxWidth: 360 }}
                      placeholder="Optional note to the student…"
                      value={notes[request.requestId] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [request.requestId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
              {isPending && (
                <div className="actions">
                  <button
                    type="button"
                    className="btn success sm"
                    disabled={busyId === request.requestId}
                    onClick={() => resolve(request, "Approved")}
                  >
                    <Check size={14} /> Approve &amp; Add to Catalog
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
