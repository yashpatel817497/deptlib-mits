"use client";

import { useEffect, useState } from "react";
import { Building2, Layers, Plus } from "lucide-react";
import { api, useFetch } from "@/lib/client";
import { useToast } from "@/components/ToastProvider";
import { EmptyState, LoadingRows } from "@/components/ui";
import type { DepartmentDTO } from "@/lib/types";

export function DepartmentsTab({
  onChanged,
  refreshKey,
}: {
  onChanged: () => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const departments = useFetch<{ departments: DepartmentDTO[] }>("/api/departments");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void departments.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function addDepartment(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/admin/department", {
        method: "POST",
        body: JSON.stringify({ deptName: name }),
      });
      toast.success(result.message);
      setName("");
      await departments.reload();
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not create the department.");
    } finally {
      setBusy(false);
    }
  }

  const list = departments.data?.departments ?? [];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Plus size={17} /> New department
            </div>
            <div className="section-desc">
              Departments group the catalogue — for example AIML, CSE, ECE or Mechanical.
            </div>
          </div>
        </div>
        <form onSubmit={addDepartment} className="form-row">
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="dept-name">Department name</label>
            <input
              id="dept-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Civil Engineering"
              required
            />
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            <Plus size={15} /> {busy ? "Creating…" : "Create department"}
          </button>
        </form>
      </section>

      <section className="card card-pad">
        <div className="section-head">
          <div>
            <div className="section-title">
              <Layers size={17} /> Departments ({list.length})
            </div>
            <div className="section-desc">Book counts update as the catalogue grows.</div>
          </div>
        </div>

        {departments.loading && <LoadingRows rows={3} />}
        {!departments.loading && list.length === 0 && (
          <EmptyState
            icon={<Building2 size={24} />}
            title="No departments"
            description="Create the first department to start cataloguing books."
          />
        )}

        <div className="dept-cards">
          {list.map((dept) => (
            <div key={dept.deptId} className="dept-card">
              <div className="d-icon">
                <Building2 size={18} />
              </div>
              <h4>{dept.deptName}</h4>
              <div className="d-meta">
                <span>{dept.bookCount} books</span>
                <span>{dept.issuedCount} on loan</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
