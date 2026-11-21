"use client";

import { useCallback, useState } from "react";
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  DatabaseBackup,
  LayoutDashboard,
  Layers,
  Megaphone,
  Repeat,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { greeting, money } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { AppBar, Spinner, TabBar, type TabItem } from "@/components/ui";
import type { IssueRequestDTO, PublicUser, ReportDTO } from "@/lib/types";
import { OverviewTab } from "./OverviewTab";
import { BooksTab } from "./BooksTab";
import { DepartmentsTab } from "./DepartmentsTab";
import { StudentsTab } from "./StudentsTab";
import { AccountsTab } from "./AccountsTab";
import { CirculationTab } from "./CirculationTab";
import { AdminRequestsTab } from "./AdminRequestsTab";
import { IssueRequestsTab } from "./IssueRequestsTab";
import { AdminNoticesTab } from "./AdminNoticesTab";
import { PolicyTab } from "./PolicyTab";
import { BackupTab } from "./BackupTab";

export function AdminPortal({ initialUser }: { initialUser: PublicUser }) {
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [version, setVersion] = useState(0);
  const report = useFetch<{ report: ReportDTO }>("/api/admin/report");
  const issueRequests = useFetch<{ requests: IssueRequestDTO[] }>("/api/admin/issue-requests");
  const pendingIssueRequests = (issueRequests.data?.requests ?? []).filter(
    (request) => request.status === "Pending"
  ).length;

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
    void report.reload();
    void issueRequests.reload();
  }, [report.reload, issueRequests.reload]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  const tabs: TabItem[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "books", label: "Books", icon: BookOpen },
    { id: "departments", label: "Departments", icon: Layers },
    { id: "students", label: "Students", icon: Users },
    { id: "accounts", label: "Create User", icon: UserPlus },
    { id: "circulation", label: "Circulation", icon: Repeat },
    {
      id: "issue-requests",
      label: "Issue Requests",
      icon: ClipboardCheck,
      count: pendingIssueRequests,
    },
    { id: "requests", label: "Book Requests", icon: ClipboardList },
    { id: "notices", label: "Notices", icon: Megaphone },
    { id: "policy", label: "Policy", icon: Settings },
    { id: "backup", label: "Backup", icon: DatabaseBackup },
  ];

  if (report.error) {
    return (
      <div className="loading-page">
        <div className="card card-pad" style={{ maxWidth: 420, textAlign: "center" }}>
          <h3 style={{ marginBottom: 6 }}>Could not load the dashboard</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {report.error}
          </p>
          <button type="button" className="btn primary" onClick={() => report.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const totals = report.data?.report.totals;
  if (!totals) {
    return (
      <div className="loading-page">
        <Spinner size="lg" />
        <span>Loading the library dashboard…</span>
      </div>
    );
  }

  return (
    <>
      <AppBar user={initialUser} onLogout={logout} brand="Librarian console" />
      <main className="container">
        <div className="hero-strip">
          <div>
            <div className="eyebrow" style={{ color: "#f2c98c" }}>
              {greeting()}, librarian
            </div>
            <h2>{initialUser.username}</h2>
            <p>Manage the catalogue, students, circulation and library policy from one place.</p>
          </div>
          <div className="hero-badges">
            <div className="hero-badge">
              <div className="n">{totals.books}</div>
              <div className="l">Books</div>
            </div>
            <div className="hero-badge">
              <div className="n">{totals.issuedBooks}</div>
              <div className="l">On loan</div>
            </div>
            <div className="hero-badge">
              <div className="n">{totals.overdueLoans}</div>
              <div className="l">Overdue</div>
            </div>
            <div className="hero-badge">
              <div className="n">{money(totals.finesCollected)}</div>
              <div className="l">Fines collected</div>
            </div>
          </div>
        </div>

        <TabBar tabs={tabs} active={tab} onSelect={setTab} />

        {tab === "overview" && (
          <OverviewTab
            report={report.data?.report ?? null}
            loading={report.loading}
            onRefresh={refresh}
          />
        )}
        {tab === "books" && <BooksTab onChanged={refresh} refreshKey={version} />}
        {tab === "departments" && <DepartmentsTab onChanged={refresh} refreshKey={version} />}
        {tab === "students" && <StudentsTab onChanged={refresh} refreshKey={version} />}
        {tab === "accounts" && <AccountsTab onChanged={refresh} />}
        {tab === "circulation" && <CirculationTab refreshKey={version} />}
        {tab === "issue-requests" && (
          <IssueRequestsTab
            requests={issueRequests.data?.requests ?? []}
            loading={issueRequests.loading}
            onChanged={refresh}
          />
        )}
        {tab === "requests" && <AdminRequestsTab onChanged={refresh} refreshKey={version} />}
        {tab === "notices" && <AdminNoticesTab onChanged={refresh} refreshKey={version} />}
        {tab === "policy" && <PolicyTab onChanged={refresh} refreshKey={version} />}
        {tab === "backup" && <BackupTab />}
      </main>
    </>
  );
}
