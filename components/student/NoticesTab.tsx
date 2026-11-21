"use client";

import { useEffect } from "react";
import { Megaphone } from "lucide-react";
import { useFetch } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, LoadingRows } from "@/components/ui";
import type { AnnouncementDTO } from "@/lib/types";

export function NoticesTab({ refreshKey }: { refreshKey: number }) {
  const notices = useFetch<{ announcements: AnnouncementDTO[] }>("/api/announcements");

  useEffect(() => {
    void notices.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const list = notices.data?.announcements ?? [];

  return (
    <section className="card card-pad">
      <div className="section-head">
        <div>
          <div className="section-title">
            <Megaphone size={17} /> Library notices
          </div>
          <div className="section-desc">Announcements published by the librarian.</div>
        </div>
      </div>

      {notices.loading && <LoadingRows rows={3} />}
      {!notices.loading && list.length === 0 && (
        <EmptyState
          icon={<Megaphone size={24} />}
          title="No notices"
          description="New announcements from the library will appear here."
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
  );
}
