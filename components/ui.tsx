"use client";

import { useEffect } from "react";
import {
  BookOpen,
  Inbox,
  LogOut,
  ShieldOff,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { statusTone, initials } from "@/lib/format";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={`modal${wide ? " wide" : ""}`}>
        {(title || subtitle) && (
          <div className="modal-head">
            <div>
              {title && <div className="modal-title">{title}</div>}
              {subtitle && <div className="modal-sub">{subtitle}</div>}
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`pill ${statusTone(status)}`}>
      {label ?? status}
    </span>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  const rating = value ?? 0;
  return (
    <span className="inline">
      <span className="stars" aria-label={rating ? `${rating} out of 5 stars` : "No ratings yet"}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={12.5}
            className={rating >= star - 0.25 ? "" : "empty"}
          />
        ))}
      </span>
      <span className="rating-text">
        {rating ? rating.toFixed(1) : "New"}
        {count !== undefined ? ` (${count})` : ""}
      </span>
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={value >= star ? "on" : ""}
          onClick={() => onChange(star)}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          role="radio"
          aria-checked={value === star}
        >
          <Star size={24} />
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Inbox size={24} />}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Spinner({ size = "sm", white }: { size?: "sm" | "lg"; white?: boolean }) {
  return <span className={`spinner${size === "lg" ? " lg" : ""}${white ? " white" : ""}`} />;
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" style={{ padding: 18 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ width: `${92 - index * 12}%` }} />
      ))}
    </div>
  );
}

export function AppBar({ user, onLogout, brand }: { user: PublicUser; onLogout: () => void; brand?: string }) {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <span className="brand">
          <span className="brand-mark">
            <BookOpen size={20} />
          </span>
          <span>
            DeptLib
            <small>{brand ?? "Department Library Management"}</small>
          </span>
        </span>
        <span className="spacer" />
        <div className="user-chip">
          <span className="avatar">{initials(user.username)}</span>
          <span className="who">
            <strong>{user.username}</strong>
            <span>
              {user.role}
              {user.departmentName ? ` · ${user.departmentName}` : ""}
            </span>
          </span>
        </div>
        <button type="button" className="btn secondary sm" onClick={onLogout}>
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </header>
  );
}

export interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="tabs" aria-label="Portal sections">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab${active === tab.id ? " active" : ""}`}
            onClick={() => onSelect(tab.id)}
            aria-current={active === tab.id ? "page" : undefined}
          >
            <Icon size={15} />
            {tab.label}
            {tab.count ? <span className="count">{tab.count}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

export function SuspendedScreen({ username }: { username: string }) {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }
  return (
    <div className="loading-page">
      <div className="card card-pad" style={{ maxWidth: 420, textAlign: "center" }}>
        <div className="empty-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <ShieldOff size={24} />
        </div>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>Account suspended</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
          {username}, your library account is currently suspended. Please contact the librarian to
          restore access.
        </p>
        <button type="button" className="btn primary block" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="alert error">
      <span>{message}</span>
    </div>
  );
}
