"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  BookOpen,
  ClipboardList,
  Compass,
  History as HistoryIcon,
  Megaphone,
  Wallet,
} from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { fmtDate, greeting, money } from "@/lib/format";
import { useToast } from "@/components/ToastProvider";
import { AppBar, Spinner, TabBar, type TabItem } from "@/components/ui";
import { PaymentModal } from "@/components/payments";
import type {
  LoanDTO,
  PublicUser,
  StudentDashboardDTO,
} from "@/lib/types";
import { DiscoverTab } from "./DiscoverTab";
import { LoansTab } from "./LoansTab";
import { FinesTab } from "./FinesTab";
import { HistoryTab } from "./HistoryTab";
import { RequestsTab } from "./RequestsTab";
import { NoticesTab } from "./NoticesTab";

interface DashboardResponse extends StudentDashboardDTO {
  user: PublicUser;
}

export function StudentPortal({ initialUser }: { initialUser: PublicUser }) {
  const toast = useToast();
  const [tab, setTab] = useState("discover");
  const [version, setVersion] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const dashboard = useFetch<DashboardResponse>("/api/student/dashboard");

  const user = dashboard.data?.user ?? initialUser;
  const stats = dashboard.data?.stats;
  const loans: LoanDTO[] = dashboard.data?.loans ?? [];
  const reservations = dashboard.data?.reservations ?? [];
  const issueRequests = dashboard.data?.issueRequests ?? [];
  const dueAlerts = dashboard.data?.dueAlerts ?? [];
  const fineRate = dashboard.data?.fineRate ?? 5;
  const readyReservations = reservations.filter((row) => row.status === "Ready");
  const fineBalance = stats?.fineBalance ?? user.fineBalance ?? 0;

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
    void dashboard.reload();
  }, [dashboard.reload]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  const tabs: TabItem[] = [
    { id: "discover", label: "Discover", icon: Compass },
    { id: "loans", label: "My Books", icon: BookOpen, count: stats?.activeLoans },
    { id: "fines", label: "Fines", icon: Wallet },
    { id: "history", label: "Activity", icon: HistoryIcon },
    { id: "requests", label: "Requests", icon: ClipboardList, count: stats?.pendingRequests },
    { id: "notices", label: "Notices", icon: Megaphone },
  ];

  if (dashboard.error) {
    return (
      <div className="loading-page">
        <div className="card card-pad" style={{ maxWidth: 420, textAlign: "center" }}>
          <h3 style={{ marginBottom: 6 }}>Could not load your library</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {dashboard.error}
          </p>
          <button type="button" className="btn primary" onClick={() => dashboard.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="loading-page">
        <Spinner size="lg" />
        <span>Opening your library dashboard…</span>
      </div>
    );
  }

  return (
    <>
      <AppBar user={user} onLogout={logout} brand="Student library" />
      <main className="container">
        <div className="hero-strip">
          <div>
            <div className="eyebrow" style={{ color: "#f2c98c" }}>
              {greeting()}
            </div>
            <h2>{user.username}</h2>
            <p>
              {user.departmentName ?? "Student"} · ID #{user.studentId} · {user.status} account
            </p>
          </div>
          <div className="hero-badges">
            <div className="hero-badge">
              <div className="n">
                {stats.activeLoans}/{stats.maxIssueLimit}
              </div>
              <div className="l">Books issued</div>
            </div>
            <div className="hero-badge">
              <div className="n">{stats.overdueLoans}</div>
              <div className="l">Overdue</div>
            </div>
            <div className="hero-badge">
              <div className="n">{money(fineBalance)}</div>
              <div className="l">Fine balance</div>
            </div>
          </div>
        </div>

        {dueAlerts.length > 0 && (
          <div className="alert-strip due-alert">
            <AlertTriangle size={18} />
            <div>
              <strong>Due soon or overdue</strong>
              <div className="alert-lines">
                {dueAlerts.map((alert) => (
                  <div key={alert.transactionId}>
                    <strong>&ldquo;{alert.title}&rdquo;</strong> — due {fmtDate(alert.dueDate)} ·{" "}
                    {alert.overdue
                      ? `${Math.abs(alert.daysUntilDue)} day${Math.abs(alert.daysUntilDue) === 1 ? "" : "s"} overdue`
                      : alert.daysUntilDue === 0
                        ? "due today"
                        : `${alert.daysUntilDue} day${alert.daysUntilDue === 1 ? "" : "s"} left`}{" "}
                    · fine ₹{fineRate}/day
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {readyReservations.length > 0 && (
          <div className="alert-strip ready-alert">
            <BellRing size={18} />
            <div>
              <strong>Your reserved book is ready</strong>
              <div className="alert-lines">
                {readyReservations.map((row) => (
                  <div key={row.reservationId}>
                    <strong>&ldquo;{row.title}&rdquo;</strong> — a returned copy is being held for you.
                    Issue it from Discover or My Books.
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn primary sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setTab("loans")}
            >
              View my books
            </button>
          </div>
        )}

        {fineBalance > 0 && (
          <div className="alert-strip">
            <Wallet size={17} />
            <span>
              You have an outstanding fine of <strong>{money(fineBalance)}</strong>. Clear it to keep
              borrowing books.
            </span>
            <button
              type="button"
              className="btn primary sm"
              style={{ marginLeft: "auto" }}
              onClick={() => {
                setTab("fines");
                setPayOpen(true);
              }}
            >
              Pay now
            </button>
          </div>
        )}

        <TabBar tabs={tabs} active={tab} onSelect={setTab} />

        {tab === "discover" && (
          <DiscoverTab
            user={user}
            loans={loans}
            maxIssueLimit={stats.maxIssueLimit}
            fineBalance={fineBalance}
            issueRequests={issueRequests}
            onChanged={refresh}
          />
        )}
        {tab === "loans" && (
          <LoansTab
            loans={loans}
            reservations={reservations}
            maxIssueLimit={stats.maxIssueLimit}
            onChanged={refresh}
            refreshKey={version}
            pendingIssueBookIds={issueRequests
              .filter((request) => request.status === "Pending")
              .map((request) => request.bookId)}
          />
        )}
        {tab === "fines" && (
          <FinesTab
            fineBalance={fineBalance}
            maxLimit={stats.maxIssueLimit}
            onPay={() => setPayOpen(true)}
            refreshKey={version}
            user={user}
          />
        )}
        {tab === "history" && <HistoryTab refreshKey={version} />}
        {tab === "requests" && (
          <RequestsTab user={user} onChanged={refresh} refreshKey={version} />
        )}
        {tab === "notices" && <NoticesTab refreshKey={version} />}
      </main>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        amount={fineBalance}
        user={user}
        onPaid={() => {
          toast.info("Fine balance updated.");
          refresh();
        }}
      />
    </>
  );
}
