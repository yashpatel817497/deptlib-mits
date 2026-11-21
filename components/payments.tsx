"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Download,
  Landmark,
  Lock,
  Printer,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { api } from "@/lib/client";
import { money, fmtDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { Modal, Spinner } from "@/components/ui";
import type { PaymentDTO, PublicUser } from "@/lib/types";

export interface ReceiptData extends PaymentDTO {
  balanceAfter: number;
}

type Step = "method" | "processing" | "success";

export function PaymentModal({
  open,
  onClose,
  amount,
  user,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  user: PublicUser;
  onPaid: (receipt: ReceiptData) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<"UPI" | "Card">("UPI");
  const [upiId, setUpiId] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (open) {
      setStep("method");
      setError(null);
      setReceipt(null);
    }
  }, [open]);

  function validate(): string | null {
    if (amount <= 0) return "There is no outstanding fine to pay.";
    if (method === "UPI") {
      if (!/^[\w.-]{2,}@[\w.-]{2,}$/.test(upiId.trim())) {
        return "Enter a valid UPI ID (e.g. name@okbank).";
      }
    } else {
      if (cardNumber.replace(/\s/g, "").length !== 16) return "Enter a 16-digit card number.";
      if (!/^\d{2}\/\d{2}$/.test(expiry)) return "Enter expiry as MM/YY.";
      if (!/^\d{3,4}$/.test(cvv)) return "Enter a valid CVV.";
      if (cardName.trim().length < 2) return "Enter the name on the card.";
    }
    return null;
  }

  async function pay() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep("processing");
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const result = await api<{ payment: ReceiptData; message: string }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      setReceipt(result.payment);
      setStep("success");
      toast.success(result.message);
      onPaid(result.payment);
    } catch (caught) {
      setStep("method");
      const message = caught instanceof Error ? caught.message : "Payment failed.";
      setError(message);
      toast.error(message);
    }
  }

  function close() {
    if (step === "processing") return;
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={step === "success" ? "Payment successful" : "Pay library fine"}
      subtitle={
        step === "success"
          ? "Your fine balance has been cleared."
          : "Simulated checkout — no real money is charged."
      }
    >
      {step === "method" && (
        <>
          <div className="amount-hero">
            <div className="label">Outstanding fine</div>
            <div className="value">{money(amount)}</div>
            <div className="meta">
              Student ID #{user.studentId ?? "—"} · {user.username}
            </div>
          </div>

          {error && (
            <div className="alert error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          <div className="method-grid">
            <button
              type="button"
              className={`method-card${method === "UPI" ? " active" : ""}`}
              onClick={() => setMethod("UPI")}
            >
              <span className="m-icon">
                <Smartphone size={18} />
              </span>
              UPI
            </button>
            <button
              type="button"
              className={`method-card${method === "Card" ? " active" : ""}`}
              onClick={() => setMethod("Card")}
            >
              <span className="m-icon">
                <CreditCard size={18} />
              </span>
              Card
            </button>
          </div>

          {method === "UPI" ? (
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="upi">UPI ID</label>
              <input
                id="upi"
                className="input"
                placeholder="yourname@okhdfcbank"
                value={upiId}
                onChange={(event) => setUpiId(event.target.value)}
                autoComplete="off"
              />
              <span className="hint">Supported apps: GPay, PhonePe, Paytm, BHIM.</span>
            </div>
          ) : (
            <div className="stack" style={{ marginBottom: 14 }}>
              <div className="field">
                <label htmlFor="card-name">Name on card</label>
                <input
                  id="card-name"
                  className="input"
                  placeholder="Full name"
                  value={cardName}
                  onChange={(event) => setCardName(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="card-number">Card number</label>
                <input
                  id="card-number"
                  className="input"
                  inputMode="numeric"
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 16);
                    setCardNumber(digits.replace(/(.{4})/g, "$1 ").trim());
                  }}
                  autoComplete="off"
                />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="expiry">Expiry</label>
                  <input
                    id="expiry"
                    className="input"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
                      setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                    }}
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="cvv">CVV</label>
                  <input
                    id="cvv"
                    className="input"
                    type="password"
                    inputMode="numeric"
                    placeholder="•••"
                    value={cvv}
                    onChange={(event) => setCvv(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pay-summary">
            <div className="row">
              <span className="muted">Amount to pay</span>
              <strong>{money(amount)}</strong>
            </div>
            <div className="row">
              <span className="muted">Method</span>
              <span>{method === "UPI" ? "UPI" : "Credit / Debit card"}</span>
            </div>
          </div>

          <button type="button" className="btn primary block" onClick={pay}>
            <Lock size={15} /> Pay {money(amount)}
          </button>
          <div className="secure-note">
            <ShieldCheck size={13} /> Secure simulated gateway · receipt generated instantly
          </div>
        </>
      )}

      {step === "processing" && (
        <div className="processing">
          <Spinner size="lg" />
          <h3>Contacting payment gateway…</h3>
          <p>Verifying your {method} payment. Please do not close this window.</p>
        </div>
      )}

      {step === "success" && receipt && (
        <>
          <div className="paid-check">
            <ShieldCheck size={30} />
          </div>
          <ReceiptCard payment={receipt} />
          <div className="receipt-actions no-print">
            <button type="button" className="btn secondary" onClick={() => printReceipt()}>
              <Printer size={15} /> Print
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => downloadReceipt(receipt, user.username)}
            >
              <Download size={15} /> Download
            </button>
            <button type="button" className="btn primary" style={{ marginLeft: "auto" }} onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ReceiptModal({
  reference,
  onClose,
  username,
}: {
  reference: string | null;
  onClose: () => void;
  username: string;
}) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    setReceipt(null);
    setError(null);
    api<{ receipt: ReceiptData }>(`/api/payments?ref=${encodeURIComponent(reference)}`)
      .then((data) => setReceipt(data.receipt))
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load the receipt.")
      );
  }, [reference]);

  return (
    <Modal open={Boolean(reference)} onClose={onClose} title="Payment receipt">
      {error && <div className="alert error">{error}</div>}
      {!receipt && !error && <Spinner size="lg" />}
      {receipt && (
        <>
          <ReceiptCard payment={receipt} />
          <div className="receipt-actions no-print">
            <button type="button" className="btn secondary" onClick={() => printReceipt()}>
              <Printer size={15} /> Print
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => downloadReceipt(receipt, username)}
            >
              <Download size={15} /> Download
            </button>
            <button type="button" className="btn primary" style={{ marginLeft: "auto" }} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ReceiptCard({ payment }: { payment: ReceiptData }) {
  return (
    <div className="receipt print-area">
      <div className="receipt-head">
        <div className="r-mark">
          <Landmark size={20} />
        </div>
        <h3>Department Library</h3>
        <p>Payment receipt · {payment.paymentStatus}</p>
      </div>
      <div className="receipt-lines">
        <div className="receipt-line">
          <span className="k">Reference ID</span>
          <span className="v">{payment.paymentReferenceId}</span>
        </div>
        <div className="receipt-line">
          <span className="k">Student ID</span>
          <span className="v">#{payment.studentId}</span>
        </div>
        <div className="receipt-line">
          <span className="k">Student</span>
          <span className="v">{payment.studentName ?? "—"}</span>
        </div>
        <div className="receipt-line">
          <span className="k">Payment method</span>
          <span className="v">{payment.method}</span>
        </div>
        <div className="receipt-line">
          <span className="k">Date &amp; time</span>
          <span className="v">{fmtDateTime(payment.timestamp)}</span>
        </div>
        <div className="receipt-line">
          <span className="k">Status</span>
          <span className="v">{payment.paymentStatus}</span>
        </div>
      </div>
      <div className="receipt-total">
        <span>Amount paid</span>
        <span>{money(payment.amount)}</span>
      </div>
      <div className="receipt-line" style={{ marginTop: 8 }}>
        <span className="k">Balance after payment</span>
        <span className="v">{money(payment.balanceAfter ?? 0)}</span>
      </div>
      <div className="receipt-foot">
        This is a computer-generated receipt for library fines. Thank you for returning your books
        on time.
      </div>
    </div>
  );
}

export function printReceipt() {
  window.print();
}

export function downloadReceipt(payment: ReceiptData, username: string) {
  const line = "=".repeat(46);
  const content = [
    "DEPARTMENT LIBRARY",
    "PAYMENT RECEIPT",
    line,
    `Reference ID : ${payment.paymentReferenceId}`,
    `Student      : ${payment.studentName ?? username} (#${payment.studentId})`,
    `Method       : ${payment.method}`,
    `Date         : ${fmtDateTime(payment.timestamp)}`,
    `Status       : ${payment.paymentStatus}`,
    line,
    `AMOUNT PAID  : ${money(payment.amount)}`,
    `BALANCE      : ${money(payment.balanceAfter ?? 0)}`,
    line,
    "Computer-generated receipt for library fines.",
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `receipt-${payment.paymentReferenceId}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
