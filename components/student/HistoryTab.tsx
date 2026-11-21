"use client";

import { useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ClipboardList,
  History as HistoryIcon,
  Star,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useFetch } from "@/lib/client";
import { fmtDateTime, money } from "@/lib/format";
import { EmptyState, LoadingRows } from "@/components/ui";
import type { HistoryEntry } from "@/lib/types";

const ICONS: Record<HistoryEntry["kind"], LucideIcon> = {
  Loan: BookOpen,
  Return: Undo2,
  Lost: AlertTriangle,
  Payment: Wallet,
  Activity: Activity,
  Request: ClipboardList,
  Review: Star,
};

export function HistoryTab({ refreshKey }: { refreshKey: number }) {
  const history = useFetch<{ history: HistoryEntry[] }>("/api/student/history");

  useEffect(() => {
    void history.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const entries = history.data?.history ?? [];

  return (
    <section className="card card-pad">
      <div className="section-head">
        <div>
          <div className="section-title">
            <HistoryIcon size={17} /> Activity &amp; transactions
          </div>
          <div className="section-desc">
            Every issue, return, renewal, review and payment on your account.
          </div>
        </div>
      </div>

      {history.loading && <LoadingRows rows={5} />}
      {!history.loading && entries.length === 0 && (
        <EmptyState
          icon={<HistoryIcon size={24} />}
          title="Nothing here yet"
          description="Your library activity will be recorded as you borrow and return books."
        />
      )}

      <div className="stack" style={{ gap: 10 }}>
        {entries.map((entry, index) => {
          const Icon = ICONS[entry.kind] ?? Activity;
          return (
            <div key={`${entry.date}-${index}`} className="notice-item" style={{ alignItems: "center" }}>
              <span className="notice-icon">
                <Icon size={16} />
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 13.5 }}>{entry.title}</p>
                <div className="meta">
                  {entry.detail}
                  {entry.amount !== undefined && entry.amount > 0 ? ` · ${money(entry.amount)}` : ""}
                </div>
              </div>
              <span className="tiny muted nowrap">{fmtDateTime(entry.date)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
