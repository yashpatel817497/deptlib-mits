"use client";

import { DatabaseBackup, Download, FileJson, FileSpreadsheet, ShieldCheck } from "lucide-react";

const TABLES = [
  "users",
  "admins",
  "students",
  "departments",
  "books",
  "book_reviews",
  "transactions",
  "payments",
  "settings",
  "announcements",
  "book_requests",
  "issue_requests",
  "activity_log",
];

export function BackupTab() {
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <DatabaseBackup size={17} /> Database backup
            </div>
            <div className="section-desc">
              Export a complete snapshot of the SQLite database — every table and relationship.
            </div>
          </div>
        </div>

        <div className="grid cols-2">
          <div className="notice-item" style={{ alignItems: "center" }}>
            <span className="notice-icon">
              <FileJson size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 650 }}>JSON backup</p>
              <div className="meta">Full structured export — ideal for restores.</div>
              <a
                className="btn primary sm"
                style={{ marginTop: 10 }}
                href="/api/admin/backup"
                download
              >
                <Download size={14} /> Download JSON
              </a>
            </div>
          </div>

          <div className="notice-item" style={{ alignItems: "center" }}>
            <span className="notice-icon">
              <FileSpreadsheet size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 650 }}>CSV backup</p>
              <div className="meta">Each table as a CSV section for spreadsheets.</div>
              <a
                className="btn primary sm"
                style={{ marginTop: 10 }}
                href="/api/admin/backup?format=csv"
                download
              >
                <Download size={14} /> Download CSV
              </a>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
          Tables included
        </div>
        <div className="filters">
          {TABLES.map((table) => (
            <span key={table} className="pill neutral">
              {table}
            </span>
          ))}
        </div>
      </section>

      <section className="card card-pad">
        <div className="section-title" style={{ fontSize: 14, marginBottom: 8 }}>
          <ShieldCheck size={16} /> Good to know
        </div>
        <ul className="muted" style={{ fontSize: 13, paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
          <li>Backups are generated live from the operational database.</li>
          <li>Password hashes are included so accounts can be restored, never plain-text passwords.</li>
          <li>Keep backups somewhere safe — they contain student records and circulation history.</li>
        </ul>
        <div className="divider" />
        <a className="btn secondary sm" href="/api/admin/report?format=csv" download>
          <Download size={14} /> Export summary report (CSV)
        </a>
      </section>
    </div>
  );
}
