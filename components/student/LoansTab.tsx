"use client";

import { useEffect, useState } from "react";
import { BookOpen, Bookmark, CalendarClock, RefreshCw, Undo2 } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDate, money } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, Modal, Pill } from "@/components/ui";
import type { LoanDTO, ReservationDTO, SettingsDTO } from "@/lib/types";

type DialogKind = "return" | "lost";

export function LoansTab({
  loans,
  reservations,
  maxIssueLimit,
  onChanged,
  refreshKey,
  pendingIssueBookIds = [],
}: {
  loans: LoanDTO[];
  reservations: ReservationDTO[];
  maxIssueLimit: number;
  onChanged: () => void;
  refreshKey: number;
  pendingIssueBookIds?: number[];
}) {
  const toast = useToast();
  const settings = useFetch<{ settings: SettingsDTO }>("/api/settings");
  const [dialog, setDialog] = useState<{ loan: LoanDTO; kind: DialogKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewing, setRenewing] = useState<number | null>(null);
  const [issuingReservation, setIssuingReservation] = useState<number | null>(null);

  useEffect(() => {
    void settings.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const lostPenalty = settings.data?.settings.lostPenalty ?? 500;

  async function renew(loan: LoanDTO) {
    setRenewing(loan.transactionId);
    try {
      const result = await api<{ message: string }>("/api/student/renew", {
        method: "POST",
        body: JSON.stringify({ transactionId: loan.transactionId }),
      });
      toast.success(result.message);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not renew the loan.");
    } finally {
      setRenewing(null);
    }
  }

  async function requestReserved(reservation: ReservationDTO) {
    setIssuingReservation(reservation.reservationId);
    try {
      const result = await api<{ message: string }>("/api/student/request-issue", {
        method: "POST",
        body: JSON.stringify({ bookId: reservation.bookId }),
      });
      toast.success(result.message);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not send the request.");
    } finally {
      setIssuingReservation(null);
    }
  }

  async function confirmDialog() {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.kind === "return") {
        const result = await api<{ message: string; fine: number }>("/api/student/return", {
          method: "POST",
          body: JSON.stringify({ transactionId: dialog.loan.transactionId }),
        });
        toast.success(result.message);
      } else {
        const result = await api<{ message: string }>("/api/student/lost", {
          method: "POST",
          body: JSON.stringify({ transactionId: dialog.loan.transactionId }),
        });
        toast.error(result.message);
      }
      setDialog(null);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the loan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {reservations.length > 0 && (
        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">
                <Bookmark size={17} /> Reserved titles
              </div>
              <div className="section-desc">
                First come, first served — a returned copy is held for the next student in line.
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {reservations.map((reservation) => (
              <div key={reservation.reservationId} className="notice-item" style={{ alignItems: "center" }}>
                <span className="notice-icon">
                  <Bookmark size={16} />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="inline" style={{ justifyContent: "space-between", width: "100%" }}>
                    <strong style={{ fontSize: 13.5 }}>{reservation.title}</strong>
                    <Pill
                      status={reservation.status === "Ready" ? "Ready" : "Pending"}
                      label={reservation.status === "Ready" ? "Ready" : `Waiting · #${reservation.position}`}
                    />
                  </div>
                  <div className="meta">
                    {reservation.status === "Ready"
                      ? "Ready — a returned copy is held for you. Request it for librarian approval."
                      : `Reserved — Position #${reservation.position} in the queue`}
                  </div>
                </div>
                {reservation.status === "Ready" &&
                  (pendingIssueBookIds.includes(reservation.bookId) ? (
                    <button type="button" className="btn secondary sm" disabled>
                      Pending Approval
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={() => requestReserved(reservation)}
                      disabled={issuingReservation === reservation.reservationId}
                    >
                      {issuingReservation === reservation.reservationId
                        ? "Requesting…"
                        : "Request Issue"}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card card-flush">
      <div className="card-pad" style={{ paddingBottom: 14 }}>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div>
            <div className="section-title">
              <BookOpen size={17} /> Currently borrowed
            </div>
            <div className="section-desc">
              {loans.length} of {maxIssueLimit} allowed · return, renew or report a lost copy.
            </div>
          </div>
          <button type="button" className="btn secondary sm" onClick={onChanged}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={24} />}
          title="No books issued yet"
          description="Head to Discover, search the catalogue and issue your first book."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Book</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th>Fine today</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => {
                const overdue = loan.daysOverdue > 0;
                const canRenew = !overdue && loan.renewalCount < 1;
                return (
                  <tr key={loan.transactionId}>
                    <td>
                      <div className="title-cell">{loan.title}</div>
                      <div className="cell-sub">
                        {loan.author} · {loan.departmentName}
                      </div>
                    </td>
                    <td className="nowrap">{fmtDate(loan.issueDate)}</td>
                    <td className="nowrap">
                      {fmtDate(loan.dueDate)}
                      {overdue && (
                        <div className="cell-sub" style={{ color: "var(--danger)" }}>
                          {loan.daysOverdue} day{loan.daysOverdue === 1 ? "" : "s"} late
                        </div>
                      )}
                    </td>
                    <td>
                      <Pill status={overdue ? "Overdue" : loan.status} />
                    </td>
                    <td className="nowrap">{loan.fineIfReturnedToday > 0 ? money(loan.fineIfReturnedToday) : "—"}</td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn primary sm"
                          onClick={() => setDialog({ loan, kind: "return" })}
                        >
                          <Undo2 size={13} /> Return
                        </button>
                        <button
                          type="button"
                          className="btn secondary sm"
                          disabled={!canRenew || renewing === loan.transactionId}
                          onClick={() => renew(loan)}
                          title={
                            overdue
                              ? "Overdue books cannot be renewed"
                              : loan.renewalCount >= 1
                                ? "Already renewed once"
                                : "Extend by 7 days"
                          }
                        >
                          <CalendarClock size={13} />
                          {renewing === loan.transactionId ? "…" : "Renew"}
                        </button>
                        <button
                          type="button"
                          className="btn danger sm"
                          onClick={() => setDialog({ loan, kind: "lost" })}
                        >
                          Lost
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
        open={Boolean(dialog)}
        onClose={() => (busy ? undefined : setDialog(null))}
        title={dialog?.kind === "return" ? "Return this book" : "Report book as lost"}
        subtitle={dialog?.loan.title}
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setDialog(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={dialog?.kind === "lost" ? "btn danger" : "btn primary"}
              onClick={confirmDialog}
              disabled={busy}
            >
              {busy
                ? "Working…"
                : dialog?.kind === "return"
                  ? "Confirm return"
                  : `Confirm lost · ${money(lostPenalty)}`}
            </button>
          </>
        }
      >
        {dialog?.kind === "return" ? (
          <div className="stack">
            <p className="muted" style={{ fontSize: 13.5 }}>
              The book will be marked Available and any overdue fine is calculated automatically.
            </p>
            <dl className="kv">
              <div>
                <dt>Due date</dt>
                <dd>{fmtDate(dialog.loan.dueDate)}</dd>
              </div>
              <div>
                <dt>Days overdue</dt>
                <dd>{dialog.loan.daysOverdue}</dd>
              </div>
              <div>
                <dt>Fine if returned today</dt>
                <dd>{money(dialog.loan.fineIfReturnedToday)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="stack">
            <div className="alert error">
              A replacement penalty of {money(lostPenalty)} will be added to your fine balance and
              the book will be removed from circulation.
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Only report a book lost after searching for it. Contact the librarian if you later
              find the copy.
            </p>
          </div>
        )}
      </Modal>
      </section>
    </div>
  );
}
