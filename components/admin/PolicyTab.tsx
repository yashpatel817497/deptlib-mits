"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { LoadingRows, Spinner } from "@/components/ui";
import type { SettingsDTO } from "@/lib/types";

const FIELDS: Array<{
  key: keyof SettingsDTO;
  label: string;
  hint: string;
  step?: string;
}> = [
  { key: "fineRate", label: "Daily fine rate (₹)", hint: "Charged per overdue day" },
  { key: "graceDays", label: "Grace period (days)", hint: "No fine during these days" },
  { key: "borrowDays", label: "Loan period (days)", hint: "Default due date window" },
  { key: "maxIssueLimit", label: "Max books per student", hint: "Concurrent loans allowed" },
  { key: "lostPenalty", label: "Lost book penalty (₹)", hint: "Replacement charge" },
  { key: "maxUnpaidFine", label: "Fine limit for borrowing (₹)", hint: "Borrowing blocks above this" },
];

export function PolicyTab({
  onChanged,
  refreshKey,
}: {
  onChanged: () => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const settings = useFetch<{ settings: SettingsDTO }>("/api/settings");
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void settings.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (!settings.data) return;
    const next: Record<string, string> = {};
    for (const field of FIELDS) next[field.key] = String(settings.data.settings[field.key]);
    setForm(next);
  }, [settings.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const field of FIELDS) payload[field.key] = Number(form[field.key]);
      const result = await api<{ message: string }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast.success(result.message);
      await settings.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card card-pad" style={{ maxWidth: 860 }}>
      <div className="section-head">
        <div>
          <div className="section-title">Fine &amp; borrowing policy</div>
          <div className="section-desc">
            Changes apply immediately to new returns, renewals and issue checks. Account creation
            lives in the Create User tab.
          </div>
        </div>
      </div>

      {settings.loading && !settings.data && <LoadingRows rows={6} />}

      {settings.data && (
        <form onSubmit={save} className="stack" style={{ gap: 14 }}>
          <div className="form-grid">
            {FIELDS.map((field) => (
              <div className="field" key={field.key}>
                <label htmlFor={`policy-${field.key}`}>{field.label}</label>
                <input
                  id={`policy-${field.key}`}
                  className="input"
                  type="number"
                  min={0}
                  step={field.step ?? "1"}
                  value={form[field.key] ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                  required
                />
                <span className="hint">{field.hint}</span>
              </div>
            ))}
          </div>
          <button
            type="submit"
            className="btn primary"
            disabled={saving}
            style={{ width: "fit-content" }}
          >
            {saving ? <Spinner white /> : <Save size={15} />} Save policy
          </button>
        </form>
      )}
    </section>
  );
}
