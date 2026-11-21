"use client";

import { useEffect, useState } from "react";
import { BookOpen, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows, Modal, Pill, Stars } from "@/components/ui";
import type { BookDTO, DepartmentDTO } from "@/lib/types";

type SortKey = "title-asc" | "title-desc" | "department" | "available" | "recent";
type StockFilter = "all" | "available" | "out";

interface BookForm {
  title: string;
  author: string;
  isbn: string;
  category: string;
  deptId: string;
  coverVariant: string;
  copies: string;
  cost: string;
}

const COVER_CHOICES = [
  { value: "auto", label: "Auto (from book ID)" },
  { value: "0", label: "Cover style 1" },
  { value: "1", label: "Cover style 2" },
  { value: "2", label: "Cover style 3" },
  { value: "3", label: "Cover style 4" },
];

const EMPTY_FORM: BookForm = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  deptId: "",
  coverVariant: "auto",
  copies: "1",
  cost: "500",
};

function compareTitles(a: BookDTO, b: BookDTO): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function sortBooks(books: BookDTO[], sort: SortKey): BookDTO[] {
  const sorted = [...books];
  switch (sort) {
    case "title-desc":
      return sorted.sort((a, b) => compareTitles(b, a));
    case "department":
      return sorted.sort(
        (a, b) =>
          a.departmentName.localeCompare(b.departmentName, undefined, { sensitivity: "base" }) ||
          compareTitles(a, b)
      );
    case "available":
      return sorted.sort((a, b) => b.availableCopies - a.availableCopies || compareTitles(a, b));
    case "recent":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.bookId - a.bookId);
    default:
      return sorted.sort(compareTitles);
  }
}

export function BooksTab({ onChanged, refreshKey }: { onChanged: () => void; refreshKey: number }) {
  const toast = useToast();
  const departments = useFetch<{ departments: DepartmentDTO[] }>("/api/departments");
  const books = useFetch<{ books: BookDTO[] }>("/api/books");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [deptId, setDeptId] = useState("");
  const [copies, setCopies] = useState("1");
  const [cost, setCost] = useState("500");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<SortKey>("title-asc");
  const [editing, setEditing] = useState<BookDTO | null>(null);
  const [form, setForm] = useState<BookForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BookDTO | null>(null);
  const [removing, setRemoving] = useState(false);
  const [menu, setMenu] = useState<{ book: BookDTO; top: number; left: number } | null>(null);

  useEffect(() => {
    void books.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (!deptId && departments.data?.departments?.length) {
      setDeptId(String(departments.data.departments[0].deptId));
    }
  }, [departments.data, deptId]);

  async function addBook(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/admin/book", {
        method: "POST",
        body: JSON.stringify({
          title,
          author,
          deptId: Number(deptId),
          replacementCost: Number(cost),
          copies: Number(copies),
        }),
      });
      toast.success(result.message);
      setTitle("");
      setAuthor("");
      await books.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the book.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(book: BookDTO) {
    setEditing(book);
    setForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn ?? "",
      category: book.category ?? "",
      deptId: String(book.deptId),
      coverVariant:
        book.coverVariant === null || book.coverVariant === undefined
          ? "auto"
          : String(book.coverVariant),
      copies: String(book.totalCopies),
      cost: String(book.replacementCost),
    });
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    const target = editing;
    if (!target) return;
    setSaving(true);
    try {
      const result = await api<{ book: BookDTO; message: string }>(`/api/books/${target.bookId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          author: form.author,
          isbn: form.isbn,
          category: form.category,
          deptId: Number(form.deptId),
          coverVariant: form.coverVariant === "auto" ? null : Number(form.coverVariant),
          copies: Number(form.copies),
          replacementCost: Number(form.cost),
        }),
      });
      toast.success(result.message);
      setEditing(null);
      await books.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the book.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const target = deleting;
    if (!target) return;
    setRemoving(true);
    try {
      const result = await api<{ message: string }>(`/api/books/${target.bookId}`, {
        method: "DELETE",
      });
      toast.success(result.message);
      setDeleting(null);
      await books.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not delete the book.");
    } finally {
      setRemoving(false);
    }
  }

  const all = books.data?.books ?? [];
  const term = search.trim().toLowerCase();
  const filtered = all.filter((book) => {
    if (deptFilter !== "all" && String(book.deptId) !== deptFilter) return false;
    if (stockFilter === "available" && book.availableCopies <= 0) return false;
    if (stockFilter === "out" && book.availableCopies > 0) return false;
    if (!term) return true;
    return (
      book.title.toLowerCase().includes(term) ||
      book.author.toLowerCase().includes(term) ||
      book.departmentName.toLowerCase().includes(term) ||
      (book.isbn ?? "").includes(term) ||
      (book.category ?? "").toLowerCase().includes(term) ||
      String(book.bookId) === term
    );
  });
  const visible = sortBooks(filtered, sort);
  const filtersActive = deptFilter !== "all" || stockFilter !== "all" || Boolean(term);
  const onLoan = editing ? Math.max(0, editing.totalCopies - editing.availableCopies) : 0;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Plus size={17} /> Add a new book
            </div>
            <div className="section-desc">Every book belongs to one department.</div>
          </div>
        </div>
        <form onSubmit={addBook}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="book-title">Title</label>
              <input
                id="book-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Introduction to Machine Learning"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="book-author">Author</label>
              <input
                id="book-author"
                className="input"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="e.g. Ethem Alpaydin"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="book-dept">Department</label>
              <select
                id="book-dept"
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
            <div className="field">
              <label htmlFor="book-copies">Number of copies</label>
              <input
                id="book-copies"
                className="input"
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="book-cost">Replacement cost (₹)</label>
              <input
                id="book-cost"
                className="input"
                type="number"
                min={1}
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            </div>
          </div>
          <div className="form-row" style={{ marginTop: 14 }}>
            <button type="submit" className="btn primary" disabled={busy}>
              <Plus size={15} /> {busy ? "Adding…" : "Add to catalogue"}
            </button>
            <span className="hint">All copies start Available; the status flips to Issued only when the last copy is out.</span>
          </div>
        </form>
      </section>

      <section className="card card-flush">
        <div className="card-pad" style={{ paddingBottom: 14 }}>
          <div className="section-head" style={{ marginBottom: 12 }}>
            <div>
              <div className="section-title">
                <BookOpen size={17} /> Catalogue ({visible.length}
                {visible.length !== all.length ? ` of ${all.length}` : ""})
              </div>
              <div className="section-desc">
                Search, filter and sort the shelf. Edit a title to change its details or stock.
              </div>
            </div>
          </div>
          <div className="search">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search titles, authors, ISBN, category, department or ID…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filters" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="book-filter-dept">Department</label>
              <select
                id="book-filter-dept"
                className="select"
                value={deptFilter}
                onChange={(event) => setDeptFilter(event.target.value)}
              >
                <option value="all">All departments</option>
                {(departments.data?.departments ?? []).map((dept) => (
                  <option key={dept.deptId} value={dept.deptId}>
                    {dept.deptName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="book-filter-status">Availability</label>
              <select
                id="book-filter-status"
                className="select"
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value as StockFilter)}
              >
                <option value="all">All availability</option>
                <option value="available">Available only</option>
                <option value="out">Out of stock</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="book-sort">Sort by</label>
              <select
                id="book-sort"
                className="select"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
              >
                <option value="title-asc">Title · A–Z</option>
                <option value="title-desc">Title · Z–A</option>
                <option value="department">Department</option>
                <option value="available">Most available copies</option>
                <option value="recent">Recently added</option>
              </select>
            </div>
            {filtersActive && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setDeptFilter("all");
                  setStockFilter("all");
                  setSearch("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {books.loading && <LoadingRows rows={5} />}
        {!books.loading && visible.length === 0 && (
          <EmptyState
            icon={<BookOpen size={24} />}
            title="No matching books"
            description="Try a different search or filter, or add a new title above."
          />
        )}
        {visible.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Copies</th>
                  <th>Status</th>
                  <th>Rating</th>
                  <th>Borrows</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((book) => (
                  <tr key={book.bookId}>
                    <td className="muted nowrap">#{String(book.bookId).padStart(4, "0")}</td>
                    <td>
                      <div className="title-cell">{book.title}</div>
                      <div className="cell-sub">{book.author}</div>
                      {book.isbn ? <div className="cell-sub">ISBN {book.isbn}</div> : null}
                    </td>
                    <td>
                      <span className="dept-chip">{book.departmentName}</span>
                      {book.category ? <div className="cell-sub">{book.category}</div> : null}
                    </td>
                    <td className="nowrap">
                      <span className="copy-count">
                        {book.availableCopies} / {book.totalCopies} available
                      </span>
                    </td>
                    <td>
                      <Pill status={book.availabilityStatus} />
                    </td>
                    <td>
                      <Stars value={book.averageRating} count={book.reviewCount} />
                    </td>
                    <td>{book.issueCount}</td>
                    <td className="nowrap muted">{fmtDate(book.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost sm icon-btn"
                        aria-label={`Actions for ${book.title}`}
                        aria-haspopup="menu"
                        aria-expanded={menu?.book.bookId === book.bookId}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (menu?.book.bookId === book.bookId) {
                            setMenu(null);
                            return;
                          }
                          const rect = event.currentTarget.getBoundingClientRect();
                          setMenu({
                            book,
                            top: rect.bottom + 6,
                            left: Math.max(8, rect.right - 168),
                          });
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        title={editing ? `Edit “${editing.title}”` : "Edit book"}
        subtitle={
          editing
            ? `Book #${String(editing.bookId).padStart(4, "0")} · ${editing.availableCopies} of ${editing.totalCopies} on the shelf`
            : undefined
        }
        wide
        footer={
          <div className="form-row">
            <button
              type="button"
              className="btn secondary"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-book-form"
              className="btn primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        }
      >
        <form id="edit-book-form" onSubmit={saveEdit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="edit-book-title">Title</label>
              <input
                id="edit-book-title"
                className="input"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-book-author">Author</label>
              <input
                id="edit-book-author"
                className="input"
                value={form.author}
                onChange={(event) => setForm({ ...form, author: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-book-isbn">ISBN</label>
              <input
                id="edit-book-isbn"
                className="input"
                value={form.isbn}
                onChange={(event) => setForm({ ...form, isbn: event.target.value })}
                placeholder="9780131103627"
                inputMode="numeric"
              />
            </div>
            <div className="field">
              <label htmlFor="edit-book-category">Category</label>
              <input
                id="edit-book-category"
                className="input"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder="e.g. Algorithms"
                maxLength={40}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-book-dept">Department</label>
              <select
                id="edit-book-dept"
                className="select"
                value={form.deptId}
                onChange={(event) => setForm({ ...form, deptId: event.target.value })}
                required
              >
                {(departments.data?.departments ?? []).map((dept) => (
                  <option key={dept.deptId} value={dept.deptId}>
                    {dept.deptName}
                  </option>
                ))}
                {editing &&
                !(departments.data?.departments ?? []).some(
                  (dept) => String(dept.deptId) === form.deptId
                ) ? (
                  <option value={form.deptId}>{editing.departmentName}</option>
                ) : null}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-book-cover">Cover variant</label>
              <select
                id="edit-book-cover"
                className="select"
                value={form.coverVariant}
                onChange={(event) => setForm({ ...form, coverVariant: event.target.value })}
              >
                {COVER_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-book-copies">Number of copies</label>
              <input
                id="edit-book-copies"
                className="input"
                type="number"
                min={1}
                max={99}
                value={form.copies}
                onChange={(event) => setForm({ ...form, copies: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-book-available">Available copies</label>
              <input
                id="edit-book-available"
                className="input"
                value={String(Math.max(0, (Number(form.copies) || 0) - onLoan))}
                readOnly
              />
            </div>
            <div className="field">
              <label htmlFor="edit-book-cost">Replacement cost (₹)</label>
              <input
                id="edit-book-cost"
                className="input"
                type="number"
                min={1}
                value={form.cost}
                onChange={(event) => setForm({ ...form, cost: event.target.value })}
              />
            </div>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {onLoan > 0
              ? `${onLoan} ${onLoan === 1 ? "copy is" : "copies are"} on loan, so stock cannot go below ${onLoan}. Available copies update automatically.`
              : "Available copies follow the total stock and update as copies are issued or returned."}
          </p>
        </form>
      </Modal>

      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(null)} />
          <div
            className="menu-pop"
            role="menu"
            aria-label="Book actions"
            style={{ top: menu.top, left: menu.left }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                openEdit(menu.book);
                setMenu(null);
              }}
            >
              <Pencil size={14} /> Edit Book
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item danger"
              onClick={() => {
                setDeleting(menu.book);
                setMenu(null);
              }}
            >
              <Trash2 size={14} /> Delete Book
            </button>
          </div>
        </>
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => {
          if (!removing) setDeleting(null);
        }}
        title="Delete this book?"
        subtitle={deleting ? `${deleting.title} · ${deleting.author}` : undefined}
        footer={
          <div className="form-row">
            <button
              type="button"
              className="btn secondary"
              disabled={removing}
              onClick={() => setDeleting(null)}
            >
              Keep book
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={removing}
              onClick={confirmDelete}
            >
              {removing ? "Deleting…" : "Delete book"}
            </button>
          </div>
        }
      >
        <p className="muted" style={{ fontSize: 13.5 }}>
          The title is removed from the catalogue and from student search. The deletion is refused
          if the book has any loan history or students waiting for it, so circulation and student
          records are never lost.
        </p>
      </Modal>
    </div>
  );
}
