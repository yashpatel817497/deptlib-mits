export function money(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return `₹${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function coverVariant(bookId: number, preference?: number | null): string {
  const variant = preference === null || preference === undefined ? bookId % 4 : Math.abs(preference) % 4;
  return `alt-${variant}`;
}

export type PillTone =
  | "available"
  | "issued"
  | "lost"
  | "overdue"
  | "active"
  | "suspended"
  | "pending"
  | "returned"
  | "approved"
  | "ready"
  | "rejected"
  | "completed"
  | "neutral";

export function statusTone(status: string): PillTone {
  const normalized = status.toLowerCase();
  if (["available", "active", "completed", "approved", "ready"].includes(normalized)) {
    return normalized as PillTone;
  }
  if (["issued", "pending", "returned"].includes(normalized)) return normalized as PillTone;
  if (["lost", "overdue", "suspended", "rejected"].includes(normalized)) {
    return normalized as PillTone;
  }
  return "neutral";
}
