function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCSV(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => cell(row[header])).join(","));
  }
  return lines.join("\r\n");
}

export function tablesToCSV(tables: Record<string, unknown[]>): string {
  const sections: string[] = [];
  for (const [name, rows] of Object.entries(tables)) {
    sections.push(`# TABLE: ${name}`);
    const typed = (rows as Array<Record<string, unknown>>) ?? [];
    sections.push(typed.length ? toCSV(typed) : "# (no rows)");
    sections.push("");
  }
  return sections.join("\r\n");
}

export function downloadHeaders(filename: string, contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}
