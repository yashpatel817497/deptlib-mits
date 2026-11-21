"use client";

import { useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows } from "@/components/ui";
import type { AnnouncementDTO } from "@/lib/types";

export function AdminNoticesTab({
  onChanged,
  refreshKey,
}: {
  onChanged: () => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const notices = useFetch<{ announcements: AnnouncementDTO[] }>("/api/announcements");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void notices.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/announcements", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      toast.success(result.message);
      setMessage("");
      await notices.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not publish the notice.");
    } finally {
      setBusy(false);
    }
  }

  const list = notices.data?.announcements ?? [];

  return (
    <div className="two-col">
      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Megaphone size={17} /> Published notices
            </div>
            <div className="section-desc">Visible on every student dashboard.</div>
          </div>
        </div>

        {notices.loading && <LoadingRows rows={3} />}
        {!notices.loading && list.length === 0 && (
          <EmptyState
            icon={<Megaphone size={24} />}
            title="No notices yet"
            description="Publish the first announcement for students."
          />
        )}

        <div className="notice-list">
          {list.map((notice) => (
            <div key={notice.announcementId} className="notice-item">
              <span className="notice-icon">
                <Megaphone size={16} />
              </span>
              <div>
                <p>{notice.message}</p>
                <div className="meta">
                  {notice.author} · {fmtDateTime(notice.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Send size={17} /> Broadcast announcement
            </div>
            <div className="section-desc">Share closures, new arrivals or policy changes.</div>
          </div>
        </div>
        <form onSubmit={publish} className="stack" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="notice-message">Message</label>
            <textarea
              id="notice-message"
              className="textarea"
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. The library will stay open until 8 PM during exam week."
              required
            />
            <span className="hint">{message.length}/1000 characters</span>
          </div>
          <button type="submit" className="btn primary" disabled={busy || message.trim().length < 5}>
            <Send size={15} /> {busy ? "Publishing…" : "Publish notice"}
          </button>
        </form>
      </section>
    </div>
  );
}
