import { all, one, run } from "./db";

export interface Settings {
  fineRate: number;
  graceDays: number;
  maxIssueLimit: number;
  borrowDays: number;
  lostPenalty: number;
  maxUnpaidFine: number;
}

const DEFAULTS: Settings = {
  fineRate: 5,
  graceDays: 2,
  maxIssueLimit: 3,
  borrowDays: 14,
  lostPenalty: 500,
  maxUnpaidFine: 100,
};

const KEY_MAP: Record<keyof Settings, string> = {
  fineRate: "fine_rate",
  graceDays: "grace_days",
  maxIssueLimit: "max_issue_limit",
  borrowDays: "borrow_days",
  lostPenalty: "lost_penalty",
  maxUnpaidFine: "max_unpaid_fine",
};

export async function getSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const stored = new Map(rows.map((row) => [row.key, Number(row.value)]));
  const settings = { ...DEFAULTS };
  (Object.keys(KEY_MAP) as Array<keyof Settings>).forEach((field) => {
    const value = stored.get(KEY_MAP[field]);
    if (typeof value === "number" && Number.isFinite(value)) settings[field] = value;
  });
  return settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  for (const field of Object.keys(KEY_MAP) as Array<keyof Settings>) {
    const value = patch[field];
    if (value === undefined || value === null) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    const bounded = field === "graceDays" || field === "maxIssueLimit" || field === "borrowDays"
      ? Math.round(numeric)
      : numeric;
    const existing = await one<{ key: string }>(
      "SELECT key FROM settings WHERE key = ?",
      KEY_MAP[field]
    );
    if (existing) {
      await run("UPDATE settings SET value = ? WHERE key = ?", String(bounded), KEY_MAP[field]);
    } else {
      await run("INSERT INTO settings (key, value) VALUES (?, ?)", KEY_MAP[field], String(bounded));
    }
  }
  return getSettings();
}
