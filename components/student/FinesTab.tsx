"use client";

import { useEffect, useState } from "react";
import { FileText, Receipt, Wallet } from "lucide-react";
import { useFetch } from "@/lib/client";
import { fmtDateTime, money } from "@/lib/format";
import { EmptyState, LoadingRows, Pill } from "@/components/ui";
import { ReceiptModal } from "@/components/payments";
import type { PaymentDTO, PublicUser, SettingsDTO } from "@/lib/types";

export function FinesTab({
  fineBalance,
  maxLimit,
  onPay,
  refreshKey,
  user,
}: {
  fineBalance: number;
  maxLimit: number;
  onPay: () => void;
  refreshKey: number;
  user: PublicUser;
}) {
  const settings = useFetch<{ settings: SettingsDTO }>("/api/settings");
  const payments = useFetch<{ payments: PaymentDTO[] }>("/api/payments");
  const [receiptRef, setReceiptRef] = useState<string | null>(null);

  useEffect(() => {
    void payments.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const policy = settings.data?.settings;
  const history = payments.data?.payments ?? [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid cols-2">
        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">
                <Wallet size={17} /> Outstanding balance
              </div>
              <div className="section-desc">Fines accrue after the grace period ends.</div>
            </div>
          </div>
          <div className="amount-hero" style={{ marginBottom: 16 }}>
            <div className="label">Amount due</div>
            <div className="value">{money(fineBalance)}</div>
            <div className="meta">
              {fineBalance > 0
                ? `Borrowing is blocked above ${money(policy?.maxUnpaidFine ?? 100)}`
                : "You are all clear — no dues right now"}
            </div>
          </div>
          <button
            type="button"
            className="btn primary block"
            disabled={fineBalance <= 0}
            onClick={onPay}
          >
            <Wallet size={15} /> Pay {money(fineBalance)}
          </button>
          <div className="secure-note">UPI or card · simulated checkout · instant receipt</div>
        </section>

        <section className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">Fine policy</div>
              <div className="section-desc">Set by the librarian and applied automatically.</div>
            </div>
          </div>
          {!policy && <LoadingRows rows={4} />}
          {policy && (
            <dl className="kv">
              <div>
                <dt>Daily fine</dt>
                <dd>{money(policy.fineRate)} / day</dd>
              </div>
              <div>
                <dt>Grace period</dt>
                <dd>{policy.graceDays} day{policy.graceDays === 1 ? "" : "s"}</dd>
              </div>
              <div>
                <dt>Loan period</dt>
                <dd>{policy.borrowDays} days</dd>
              </div>
              <div>
                <dt>Borrowing limit</dt>
                <dd>{maxLimit} books</dd>
              </div>
              <div>
                <dt>Lost book penalty</dt>
                <dd>{money(policy.lostPenalty)}</dd>
              </div>
              <div>
                <dt>Fine limit for borrowing</dt>
                <dd>{money(policy.maxUnpaidFine)}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <section className="card card-flush">
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="section-title">
            <Receipt size={17} /> Payment history
          </div>
          <div className="section-desc">Download or print any past receipt.</div>
        </div>
        {payments.loading && <LoadingRows rows={3} />}
        {!payments.loading && history.length === 0 && (
          <EmptyState
            icon={<Receipt size={24} />}
            title="No payments yet"
            description="Your fine payments and receipts will appear here."
          />
        )}
        {history.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {history.map((payment) => (
                  <tr key={payment.paymentReferenceId}>
                    <td>
                      <div className="title-cell">{payment.paymentReferenceId}</div>
                    </td>
                    <td className="nowrap">{fmtDateTime(payment.timestamp)}</td>
                    <td>{payment.method}</td>
                    <td className="nowrap">{money(payment.amount)}</td>
                    <td>
                      <Pill status={payment.paymentStatus} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => setReceiptRef(payment.paymentReferenceId)}
                      >
                        <FileText size={13} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReceiptModal
        reference={receiptRef}
        username={user.username}
        onClose={() => setReceiptRef(null)}
      />
    </div>
  );
}
