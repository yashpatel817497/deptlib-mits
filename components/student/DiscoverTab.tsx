"use client";

import { useEffect, useState } from "react";
import { BookOpen, Compass, Search, Sparkles } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { coverVariant } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, Pill, Stars } from "@/components/ui";
import { BookDetailsModal } from "@/components/BookDetailsModal";
import type {
  BookDTO,
  DepartmentDTO,
  IssueRequestDTO,
  LoanDTO,
  PublicUser,
  SettingsDTO,
} from "@/lib/types";

type AvailabilityFilter = "all" | "available" | "out";
type SortKey = "title-asc" | "title-desc" | "recent" | "available";

function compareTitles(a: BookDTO, b: BookDTO): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function sortBooks(books: BookDTO[], sort: SortKey): BookDTO[] {
  const sorted = [...books];
  switch (sort) {
    case "title-desc":
      return sorted.sort((a, b) => compareTitles(b, a));
    case "recent":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.bookId - a.bookId);
    case "available":
      return sorted.sort((a, b) => b.availableCopies - a.availableCopies || compareTitles(a, b));
    default:
      return sorted.sort(compareTitles);
  }
}

function BookCard({
  book,
  onOpen,
  onRequest,
  onReserve,
  issueReason,
  hasLoan,
  pendingRequest,
  busyRequest,
  busyReserve,
}: {
  book: BookDTO;
  onOpen: () => void;
  onRequest: () => void;
  onReserve: () => void;
  issueReason: string | null;
  hasLoan: boolean;
  pendingRequest: boolean;
  busyRequest: boolean;
  busyReserve: boolean;
}) {
  const reserved = book.myReservation;
  const fullyIssued = book.availableCopies <= 0;
  const gone = book.availabilityStatus === "Lost" && book.totalCopies === 0;

  let action: React.ReactNode;
  if (gone) {
    action = (
      <button type="button" className="btn secondary sm" disabled>
        Unavailable
      </button>
    );
  } else if (hasLoan) {
    action = (
      <button type="button" className="btn secondary sm" disabled>
        Issued to you
      </button>
    );
  } else if (pendingRequest) {
    action = (
      <button
        type="button"
        className="btn secondary sm"
        disabled
        title="Your request is waiting for the librarian"
      >
        Pending Approval
      </button>
    );
  } else if (reserved?.status === "Ready") {
    action = (
      <button
        type="button"
        className="btn primary sm"
        onClick={onRequest}
        disabled={Boolean(issueReason) || busyRequest}
        title={issueReason ?? "A returned copy is held for you"}
      >
        {busyRequest ? "Requesting…" : "Request Issue"}
      </button>
    );
  } else if (reserved) {
    action = (
      <button type="button" className="btn secondary sm" disabled>
        Reserved · #{reserved.position}
      </button>
    );
  } else if (fullyIssued && book.holdForOther) {
    action = (
      <button type="button" className="btn secondary sm" disabled title="A copy is on hold for another student">
        On hold
      </button>
    );
  } else if (fullyIssued) {
    action = (
      <button type="button" className="btn secondary sm" onClick={onReserve} disabled={busyReserve}>
        {busyReserve ? "Reserving…" : "Reserve"}
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        className="btn primary sm"
        onClick={onRequest}
        disabled={Boolean(issueReason) || busyRequest}
        title={issueReason ?? undefined}
      >
        {busyRequest ? "Requesting…" : "Request Issue"}
      </button>
    );
  }

  return (
    <article className="book-card">
      <div className={`book-cover ${coverVariant(book.bookId, book.coverVariant)}`}>
        <span className="initials">{book.title.slice(0, 2).toUpperCase()}</span>
        <Pill status={book.availabilityStatus} />
      </div>
      <div className="book-body">
        <button
          type="button"
          className="book-title"
          style={{ textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer" }}
          onClick={onOpen}
        >
          {book.title}
        </button>
        <span className="book-author">{book.author}</span>
        <div className="book-meta">
          <span className="dept-chip">{book.departmentName}</span>
          <span className="copy-count">
            {book.availableCopies} / {book.totalCopies} Available
          </span>
          <Stars value={book.averageRating} count={book.reviewCount} />
        </div>
      </div>
      <div className="book-foot">
        <button type="button" className="btn ghost sm" onClick={onOpen}>
          Details
        </button>
        {action}
      </div>
    </article>
  );
}

export function DiscoverTab({
  user,
  loans,
  maxIssueLimit,
  fineBalance,
  issueRequests,
  onChanged,
}: {
  user: PublicUser;
  loans: LoanDTO[];
  maxIssueLimit: number;
  fineBalance: number;
  issueRequests: IssueRequestDTO[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [deptId, setDeptId] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sort, setSort] = useState<SortKey>("title-asc");
  const [openBookId, setOpenBookId] = useState<number | null>(null);
  const [busyBookId, setBusyBookId] = useState<number | null>(null);
  const [reservingBookId, setReservingBookId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 260);
    return () => clearTimeout(timer);
  }, [q]);

  const departments = useFetch<{ departments: DepartmentDTO[] }>("/api/departments");
  const settings = useFetch<{ settings: SettingsDTO }>("/api/settings");
  const recommendations = useFetch<{ books: BookDTO[] }>("/api/student/recommendations");
  const catalogue = useFetch<{ books: BookDTO[] }>(
    `/api/books?q=${encodeURIComponent(debouncedQ)}&deptId=${deptId}`
  );

  const maxUnpaidFine = settings.data?.settings.maxUnpaidFine ?? 100;
  const issueReason =
    loans.length >= maxIssueLimit
      ? `Borrowing limit reached (${loans.length}/${maxIssueLimit}). Return a book first.`
      : fineBalance > maxUnpaidFine
        ? `Clear your outstanding fine (above ₹${maxUnpaidFine}) to borrow more books.`
        : null;
  const loanBookIds = new Set(loans.map((loan) => loan.bookId));
  const pendingBookIds = new Set(
    issueRequests.filter((request) => request.status === "Pending").map((request) => request.bookId)
  );

  async function requestIssue(bookId: number) {
    setBusyBookId(bookId);
    try {
      const result = await api<{ message: string }>("/api/student/request-issue", {
        method: "POST",
        body: JSON.stringify({ bookId }),
      });
      toast.success(result.message);
      setOpenBookId(null);
      onChanged();
      void catalogue.reload();
      void recommendations.reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not send the request.");
    } finally {
      setBusyBookId(null);
    }
  }

  async function reserve(bookId: number) {
    setReservingBookId(bookId);
    try {
      const result = await api<{ message: string }>("/api/student/reserve", {
        method: "POST",
        body: JSON.stringify({ bookId }),
      });
      toast.success(result.message);
      setOpenBookId(null);
      onChanged();
      void catalogue.reload();
      void recommendations.reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not reserve the book.");
    } finally {
      setReservingBookId(null);
    }
  }

  const allBooks = catalogue.data?.books ?? [];
  const matching = allBooks.filter((book) => {
    if (availability === "available") return book.availableCopies > 0;
    if (availability === "out") return book.availableCopies <= 0;
    return true;
  });
  const books = sortBooks(matching, sort);
  const picks = (recommendations.data?.books ?? []).slice(0, 3);
  const filtersActive = Boolean(q || deptId) || availability !== "all";

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Sparkles size={17} /> Recommended for {user.departmentName ?? "you"}
            </div>
            <div className="section-desc">
              Available titles picked from your department and the most-borrowed shelf.
            </div>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => recommendations.reload()}
          >
            Refresh picks
          </button>
        </div>
        {recommendations.loading && <div className="skeleton block" />}
        {!recommendations.loading && picks.length === 0 && (
          <p className="muted tiny">No recommendations right now — check the full catalogue below.</p>
        )}
        <div className="book-grid">
          {picks.map((book) => (
            <BookCard
              key={book.bookId}
              book={book}
              onOpen={() => setOpenBookId(book.bookId)}
              onRequest={() => requestIssue(book.bookId)}
              onReserve={() => reserve(book.bookId)}
              issueReason={issueReason}
              hasLoan={loanBookIds.has(book.bookId)}
              pendingRequest={pendingBookIds.has(book.bookId)}
              busyRequest={busyBookId === book.bookId}
              busyReserve={reservingBookId === book.bookId}
            />
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Compass size={17} /> Browse the catalogue
            </div>
            <div className="section-desc">
              Search by title, author or book ID, then filter and sort the shelf. Requests are
              approved by the librarian before a copy is issued.
            </div>
          </div>
        </div>

        <div className="filters" style={{ marginBottom: 16 }}>
          <div className="search">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search title, author, book ID…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              aria-label="Search books"
            />
          </div>
          <select
            className="select"
            value={deptId}
            onChange={(event) => setDeptId(event.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {(departments.data?.departments ?? []).map((dept) => (
              <option key={dept.deptId} value={dept.deptId}>
                {dept.deptName}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={availability}
            onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}
            aria-label="Filter by availability"
          >
            <option value="all">All availability</option>
            <option value="available">Available only</option>
            <option value="out">Out of stock</option>
          </select>
          <select
            className="select"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort books"
          >
            <option value="title-asc">Title · A–Z</option>
            <option value="title-desc">Title · Z–A</option>
            <option value="recent">Recently added</option>
            <option value="available">Most available copies</option>
          </select>
          {filtersActive && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setQ("");
                setDeptId("");
                setAvailability("all");
              }}
            >
              Reset filters
            </button>
          )}
        </div>

        {catalogue.loading && (
          <div className="book-grid">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton block" />
            ))}
          </div>
        )}
        {!catalogue.loading && books.length === 0 && (
          <EmptyState
            icon={<BookOpen size={24} />}
            title="No books match those filters"
            description="Try a different title, author, department or availability."
          />
        )}
        <div className="book-grid">
          {books.map((book) => (
            <BookCard
              key={book.bookId}
              book={book}
              onOpen={() => setOpenBookId(book.bookId)}
              onRequest={() => requestIssue(book.bookId)}
              onReserve={() => reserve(book.bookId)}
              issueReason={issueReason}
              hasLoan={loanBookIds.has(book.bookId)}
              pendingRequest={pendingBookIds.has(book.bookId)}
              busyRequest={busyBookId === book.bookId}
              busyReserve={reservingBookId === book.bookId}
            />
          ))}
        </div>
      </section>

      <BookDetailsModal
        bookId={openBookId}
        onClose={() => setOpenBookId(null)}
        onIssue={requestIssue}
        onReserve={reserve}
        issueDisabledReason={issueReason}
        hasActiveLoan={openBookId !== null && loanBookIds.has(openBookId)}
        pendingRequest={openBookId !== null && pendingBookIds.has(openBookId)}
      />
    </div>
  );
}
