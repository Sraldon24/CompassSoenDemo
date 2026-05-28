"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skipErrors, setSkipErrors] = useState(true);
  const [pending, setPending] = useState(false);

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
      if (mode === "commit") fd.append("skipErrors", String(skipErrors));
      const res = await fetch("/api/import/excel", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Import failed");
      }
      if (mode === "preview") {
        setPreview((await res.json()) as Preview);
      } else {
        const data = (await res.json()) as { imported: number };
        toast.success(`Imported ${data.imported} courses into your plan.`);
        router.push("/plan");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
          Import plan from Excel
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Upload a .xlsx file with a &quot;Term Plan&quot; sheet (Term, Course, Title, Cr, Type,
          Status, Notes columns). Preview the parsed rows, then confirm to replace your current
          plan.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload</CardTitle>
          <CardDescription>Only the Term Plan sheet is parsed in this version.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="block w-full text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={() => upload("preview")} disabled={!file || pending}>
              <Upload className="mr-2 h-4 w-4" />
              {pending ? "Parsing…" : "Preview"}
            </Button>
            {preview && preview.ok > 0 && (
              <Button onClick={() => upload("commit")} disabled={pending} variant="ghost">
                Commit {skipErrors ? preview.ok : preview.total} rows
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
            <div
              className="overflow-auto max-h-96 border rounded"
              style={{ borderColor: "var(--color-border)" }}
            >
              <table className="w-full text-xs">
                <thead style={{ background: "var(--color-surface-2)" }}>
                  <tr>
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Term</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr
                      key={r.index}
                      style={{
                        borderTop: "1px solid var(--color-border)",
                        opacity: r.errors.length > 0 ? 0.6 : 1,
                      }}
                    >
                      <td className="p-2 mono tnum">
                        {r.errors.length === 0 ? (
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
                      <td className="p-2 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        {r.errors.join("; ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
