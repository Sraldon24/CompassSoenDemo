"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface PreviewRow {
  index: number;
  courseCode: string;
  term: string;
  year: number;
  status: string;
  notes: string | null;
  errors: string[];
}

interface Preview {
  total: number;
  ok: number;
  errored: number;
  rows: PreviewRow[];
}

export function ImportClient(): React.ReactElement {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipErrors, setSkipErrors] = useState(true);
  const [pending, setPending] = useState(false);
  // Row indices the user has ticked to actually import. Seeded with every
  // error-free row when a preview lands, so the default is "import all valid".
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const upload = async (mode: "preview" | "commit") => {
    if (!file) {
      toast.error("Select a .xlsx file first.");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      if (mode === "commit") {
        fd.append("skipErrors", String(skipErrors));
        fd.append("selectedIndices", [...selected].join(","));
      }
      const res = await fetch("/api/import/excel", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Import failed");
      }
      if (mode === "preview") {
        const { payload } = (await res.json()) as { payload: Preview };
        setPreview(payload);
        // Default to every valid row selected.
        setSelected(new Set(payload.rows.filter((r) => r.errors.length === 0).map((r) => r.index)));
      } else {
        const { payload } = (await res.json()) as { payload: { imported: number } };
        toast.success(`Imported ${payload.imported} courses into your plan.`);
        router.push("/plan");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  };

  // Valid (importable) rows + how many of them are currently ticked.
  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];
  const selectedCount = validRows.filter((r) => selected.has(r.index)).length;
  const allSelected = validRows.length > 0 && selectedCount === validRows.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(validRows.map((r) => r.index)));
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-6">
      <header
        className="relative overflow-hidden rounded-2xl ring-hairline shadow-[var(--shadow-md)] p-6 sm:p-8 animate-rise"
        style={{ background: "var(--gradient-surface)" }}
      >
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div className="relative space-y-3">
          <p className="eyebrow">Settings</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl ring-hairline shrink-0"
              style={{ background: "var(--gradient-accent-soft)" }}
            >
              <FileSpreadsheet className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
            </span>
            Import plan from Excel
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Upload a .xlsx file with a &quot;Term Plan&quot; sheet (Term, Course, Title, Cr, Type,
            Status, Notes columns). Preview the parsed rows, then confirm to replace your current
            plan.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload</CardTitle>
          <CardDescription>Only the Term Plan sheet is parsed in this version.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="sr-only"
            id="xlsx-upload"
          />
          <label
            htmlFor="xlsx-upload"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl ring-hairline"
              style={{ background: "var(--gradient-accent-soft)" }}
            >
              <Upload
                className="h-5 w-5"
                style={{ color: "var(--color-accent)" }}
                aria-hidden="true"
              />
            </span>
            <span className="text-sm font-medium">
              {file ? (
                <span className="mono" style={{ color: "var(--color-text)" }}>
                  {file.name}
                </span>
              ) : (
                "Choose a .xlsx file to upload"
              )}
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {file ? "Tap to choose a different file" : "No file chosen yet"}
            </span>
          </label>
          <div className="flex gap-2">
            <Button onClick={() => upload("preview")} disabled={!file || pending}>
              <Upload className="mr-2 h-4 w-4" />
              {pending ? "Parsing…" : "Preview"}
            </Button>
            {preview && preview.ok > 0 && (
              <Button
                onClick={() => upload("commit")}
                disabled={pending || selectedCount === 0}
                variant="ghost"
              >
                Commit {selectedCount} selected
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Preview</CardTitle>
            <CardDescription className="flex gap-4 text-xs">
              <span>Total: {preview.total}</span>
              <span style={{ color: "var(--color-success)" }}>OK: {preview.ok}</span>
              <span style={{ color: "var(--color-danger)" }}>Errors: {preview.errored}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={skipErrors}
                onChange={(e) => setSkipErrors(e.target.checked)}
              />
              Skip rows with errors
            </label>
            <div className="overflow-auto max-h-96 rounded-xl ring-hairline scroll-slim">
              <table className="w-full text-xs">
                <thead style={{ background: "var(--color-surface-2)" }}>
                  <tr
                    className="text-[10px] uppercase tracking-wide"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <th className="p-2 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all importable rows"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={validRows.length === 0}
                      />
                    </th>
                    <th className="text-left p-2 font-medium">Code</th>
                    <th className="text-left p-2 font-medium">Term</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const importable = r.errors.length === 0;
                    return (
                      <tr
                        key={r.index}
                        style={{
                          borderTop: "1px solid var(--color-border)",
                          opacity: importable ? 1 : 0.6,
                        }}
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Import ${r.courseCode}`}
                            checked={importable && selected.has(r.index)}
                            disabled={!importable}
                            onChange={() => toggleRow(r.index)}
                          />
                        </td>
                        <td className="p-2 mono tnum">
                          {importable ? (
                            <CheckCircle2
                              className="inline h-3 w-3 mr-1"
                              style={{ color: "var(--color-success)" }}
                            />
                          ) : (
                            <XCircle
                              className="inline h-3 w-3 mr-1"
                              style={{ color: "var(--color-danger)" }}
                            />
                          )}
                          {r.courseCode}
                        </td>
                        <td className="p-2">{r.term}</td>
                        <td className="p-2">{r.status}</td>
                        <td
                          className="p-2 text-[11px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {r.errors.join("; ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
