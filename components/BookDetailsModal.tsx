"use client";

import { useEffect, useState } from "react";
import { BookOpen, Loader2, Send, Users } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDate, fmtDateTime, coverVariant } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { Modal, Pill, StarPicker, Stars } from "@/components/ui";
import type { BookDetailsDTO } from "@/lib/types";

export function BookDetailsModal({
  bookId,
  onClose,
  onIssue,
  onReserve,
  issueDisabledReason,
  hasActiveLoan = false,
  pendingRequest = false,
  allowReview = true,
}: {
  bookId: number | null;
  onClose: () => void;
  onIssue?: (bookId: number) => Promise<void>;
  onReserve?: (bookId: number) => Promise<void>;
  issueDisabledReason?: string | null;
  hasActiveLoan?: boolean;
  pendingRequest?: boolean;
  allowReview?: boolean;
}) {
  const toast = useToast();
  const [book, setBook] = useState<BookDetailsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [reserving, setReserving] = useState(false);

  async function load(id: number) {
    setError(null);
    try {
      const data = await api<{ book: BookDetailsDTO }>(`/api/books/${id}`);
      setBook(data.book);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the book.");
    }
  }

  useEffect(() => {
    if (!bookId) {
      setBook(null);
      setRating(0);
      setComment("");
      return;
    }
    void load(bookId);
  }, [bookId]);

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!book) return;
    if (rating === 0) {
      toast.error("Pick a star rating first.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/student/review", {
        method: "POST",
        body: JSON.stringify({ bookId: book.bookId, rating, comment }),
      });
      toast.success(result.message);
      setComment("");
      await load(book.bookId);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the review.");
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!book || !onIssue) return;
    setIssuing(true);
    try {
      await onIssue(book.bookId);
      await load(book.bookId);
    } finally {
      setIssuing(false);
    }
  }

  async function reserve() {
    if (!book || !onReserve) return;
    setReserving(true);
    try {
      await onReserve(book.bookId);
      await load(book.bookId);
    } finally {
      setReserving(false);
    }
  }

  return (
    <Modal open={Boolean(bookId)} onClose={onClose} title="Book details" wide>
      {error && <div className="alert error">{error}</div>}
      {!book && !error && (
        <div className="processing">
          <Loader2 className="spin" size={26} />
          <p>Loading book details…</p>
        </div>
      )}

      {book && (
        <>
          <div
            className={`book-cover ${coverVariant(book.bookId, book.coverVariant)}`}
            style={{ borderRadius: 14, marginBottom: 16 }}
          >
            <span className="initials">{book.title.slice(0, 2).toUpperCase()}</span>
            <span className="cover-icon">
              <BookOpen size={26} />
            </span>
          </div>

          <div className="section-head" style={{ marginBottom: 10 }}>
            <div>
              <div className="section-title" style={{ fontSize: 18 }}>
                {book.title}
              </div>
              <div className="muted tiny" style={{ marginTop: 2 }}>
                by {book.author} · Book #{String(book.bookId).padStart(4, "0")}
                {book.isbn ? ` · ISBN ${book.isbn}` : ""}
                {book.category ? ` · ${book.category}` : ""}
              </div>
            </div>
            <Pill status={book.availabilityStatus} />
          </div>

          <div className="book-meta" style={{ marginBottom: 14 }}>
            <span className="dept-chip">{book.departmentName}</span>
            <span className="copy-count">
              {book.availableCopies} / {book.totalCopies} Available
            </span>
            <Stars value={book.averageRating} count={book.reviewCount} />
            <span className="muted tiny">{book.issueCount} borrows</span>
          </div>

          {book.myReservation && (
            <div className="alert info" style={{ marginBottom: 14 }}>
              <Users size={16} />
              <span>
                {book.myReservation.status === "Ready"
                  ? "A returned copy is held for you — request it and the librarian will confirm."
                  : `You are reserved — position #${book.myReservation.position} in the queue.`}
              </span>
            </div>
          )}
          {!book.myReservation && book.holdForOther && (
            <div className="alert info" style={{ marginBottom: 14 }}>
              <Users size={16} />
              <span>The next returned copy is on hold for another student in the queue.</span>
            </div>
          )}

          {book.availabilityStatus === "Issued" && book.activeLoan && (
            <div className="alert info" style={{ marginBottom: 14 }}>
              <Users size={16} />
              <span>
                Currently with <strong>{book.activeLoan.studentName}</strong> · due{" "}
                {fmtDate(book.activeLoan.dueDate)}
              </span>
            </div>
          )}
          {book.availabilityStatus === "Lost" && (
            <div className="alert error" style={{ marginBottom: 14 }}>
              <BookOpen size={16} />
              <span>This copy was reported lost and is no longer in circulation.</span>
            </div>
          )}

          {(onIssue || onReserve) && (
            <div className="form-row" style={{ marginBottom: 18 }}>
              {hasActiveLoan ? (
                <button type="button" className="btn secondary" disabled>
                  You already have this book
                </button>
              ) : pendingRequest ? (
                <button type="button" className="btn secondary" disabled>
                  Pending Approval
                </button>
              ) : book.myReservation?.status === "Ready" ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={issue}
                  disabled={Boolean(issueDisabledReason) || issuing}
                >
                  {issuing ? "Requesting…" : "Request held copy"}
                </button>
              ) : book.myReservation ? (
                <button type="button" className="btn secondary" disabled>
                  Reserved · Position #{book.myReservation.position}
                </button>
              ) : book.availableCopies > 0 ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={issue}
                  disabled={Boolean(issueDisabledReason) || issuing}
                >
                  {issuing ? "Requesting…" : "Request this book"}
                </button>
              ) : book.availabilityStatus === "Lost" ? (
                <button type="button" className="btn secondary" disabled>
                  No longer in circulation
                </button>
              ) : book.holdForOther ? (
                <button type="button" className="btn secondary" disabled>
                  On hold for another student
                </button>
              ) : (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={reserve}
                  disabled={!onReserve || reserving}
                >
                  {reserving ? "Reserving…" : "Reserve this book"}
                </button>
              )}
              {issueDisabledReason && book.availableCopies > 0 && (
                <span className="hint">{issueDisabledReason}</span>
              )}
            </div>
          )}

          <div className="divider" />

          <div className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
            Student reviews
          </div>
          {book.reviews.length === 0 && (
            <p className="muted tiny" style={{ marginBottom: 12 }}>
              No reviews yet — be the first to share your thoughts.
            </p>
          )}
          <div style={{ marginBottom: 16 }}>
            {book.reviews.map((review) => (
              <div key={review.reviewId} className="review">
                <div className="review-top">
                  <div className="inline">
                    <strong>{review.studentName}</strong>
                    <Stars value={review.rating} />
                  </div>
                  <span className="date">{fmtDateTime(review.createdAt)}</span>
                </div>
                {review.comment && <p>{review.comment}</p>}
              </div>
            ))}
          </div>

          {allowReview && (
            <form onSubmit={submitReview} className="card card-pad" style={{ boxShadow: "none" }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Your rating</label>
                <StarPicker value={rating} onChange={setRating} />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="review-comment">Review</label>
                <textarea
                  id="review-comment"
                  className="textarea"
                  placeholder="What did you think about this book?"
                  value={comment}
                  maxLength={500}
                  onChange={(event) => setComment(event.target.value)}
                />
              </div>
              <button type="submit" className="btn secondary sm" disabled={busy}>
                <Send size={14} /> {busy ? "Saving…" : "Submit review"}
              </button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
