"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Receipt,
  ShieldCheck,
  User,
} from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import type { PublicUser } from "@/lib/types";
import { Spinner } from "@/components/ui";

const CAMPUS_CONTEXT =
  "4 Academic Departments • Curated Engineering & AI Collection • Quiet Study & Digital Issue";

export function LoginView({ needsSetup }: { needsSetup: boolean }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (needsSetup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (needsSetup) {
        const result = await api<{ user: PublicUser; message: string }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, password, role: "Admin" }),
        });
        toast.success(result.message);
        window.location.assign("/admin");
      } else {
        const result = await api<{ user: PublicUser }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        toast.success(`Welcome back, ${result.user.username}!`);
        window.location.assign(result.user.role === "Admin" ? "/admin" : "/student");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete the request.");
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <span className="brand">
          <span className="brand-mark">
            <BookOpen size={20} />
          </span>
          <span>
            DeptLib
            <small>Department Library Management</small>
          </span>
        </span>

        <div className="hero-main">
          <div className="eyebrow">The department library · open to every scholar</div>
          <h1>A quiet place for loud ideas.</h1>
          <p className="lede">
            Four departments share one carefully kept catalogue. Borrow a book between lectures,
            renew it from your desk, and return it at the counter — no queues, no guesswork.
          </p>

          <ul className="hero-list">
            <li>
              <span className="tick">
                <Layers size={14} />
              </span>
              Four academic departments, one shared shelf
            </li>
            <li>
              <span className="tick">
                <Clock size={14} />
              </span>
              Renew from your desk; return at the library counter
            </li>
            <li>
              <span className="tick">
                <Receipt size={14} />
              </span>
              Clear due dates, fair fines and instant receipts
            </li>
            <li>
              <span className="tick">
                <ShieldCheck size={14} />
              </span>
              Accounts issued at the desk by a librarian
            </li>
          </ul>

          <div className="campus-preview" aria-label={CAMPUS_CONTEXT}>
            <div className="campus-preview-label">Inside the library</div>
            <div className="campus-items">
              <span className="campus-item">
                <Layers size={14} /> 4 Academic Departments
              </span>
              <span className="campus-sep" aria-hidden="true" />
              <span className="campus-item">
                <BookOpen size={14} /> Curated Engineering &amp; AI Collection
              </span>
              <span className="campus-sep" aria-hidden="true" />
              <span className="campus-item">
                <Clock size={14} /> Quiet Study &amp; Digital Issue
              </span>
            </div>
          </div>
        </div>

        <div className="hero-foot">
          <span>
            <span className="dot" />
            Open to students and faculty
          </span>
          <span>A campus library, online</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-stack">
          <div className="auth-card">
            <div className="auth-kicker">
              {needsSetup ? "Library desk · first-time setup" : "The library desk · patron access"}
            </div>
            <h2>{needsSetup ? "First-time admin setup" : "Welcome back to the library"}</h2>
            <p className="sub">
              {needsSetup
                ? "Create the first administrator account for this library."
                : "Sign in with the account issued to you at the library desk."}
            </p>

            {needsSetup && (
              <div className="alert info" style={{ marginBottom: 18 }}>
                <ShieldCheck size={16} />
                <span>
                  This setup appears only until the first administrator exists. After that, all
                  accounts are created from the admin dashboard and public sign-up stays disabled.
                </span>
              </div>
            )}

            <form className="auth-form" onSubmit={submit}>
              {error && (
                <div className="alert error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="field">
                <label htmlFor="username">Username</label>
                <div className="pw-wrap" style={{ position: "relative" }}>
                  <User
                    size={16}
                    style={{
                      position: "absolute",
                      left: 13,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted-2)",
                    }}
                  />
                  <input
                    id="username"
                    className="input"
                    style={{ paddingLeft: 38 }}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Your library username"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="pw-wrap">
                  <Lock
                    size={16}
                    style={{
                      position: "absolute",
                      left: 13,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted-2)",
                    }}
                  />
                  <input
                    id="password"
                    className="input"
                    style={{ paddingLeft: 38 }}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={needsSetup ? "At least 6 characters" : "Your password"}
                    autoComplete={needsSetup ? "new-password" : "current-password"}
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {needsSetup && (
                <div className="field">
                  <label htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm"
                    className="input"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                className="btn primary block"
                disabled={busy}
                style={{ marginTop: 4 }}
              >
                {busy ? (
                  <>
                    <Spinner white /> {needsSetup ? "Creating administrator…" : "Signing in…"}
                  </>
                ) : (
                  <>
                    {needsSetup ? "Create admin account" : "Sign in"} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {needsSetup && (
              <p className="hint" style={{ marginTop: 16, display: "flex", gap: 6 }}>
                <CheckCircle2
                  size={14}
                  style={{ color: "var(--success)", flex: "none", marginTop: 2 }}
                />
                The password is hashed before storage and the new administrator is signed in
                automatically.
              </p>
            )}

            {!needsSetup && (
              <p className="hint" style={{ marginTop: 16 }}>
                Accounts are issued by the library desk. Ask your librarian if you need access.
              </p>
            )}
          </div>

          <div className="team-credit">
            <div className="credit-label">Created by</div>
            <div className="credit-lead">
              <span className="credit-name">Yash Patel</span>
            </div>
            <div className="credit-row">
              <span className="credit-name">Saransh Gupta</span>
              <span className="credit-name">Hariom Shrivastava</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
