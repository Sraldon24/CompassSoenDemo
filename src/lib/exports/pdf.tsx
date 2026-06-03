/**
 * PDF plan export using @react-pdf/renderer.
 *
 * The PDF is intentionally simple: degree progress overview, then per-term
 * tables of courses. The structure mirrors the on-screen Plan + Requirements
 * pages so a printed copy is recognizable.
 */

import type { CategoryProgress } from "@/lib/domain/requirements";
import { TOTAL_DEGREE_CREDITS } from "@/lib/domain/requirements";
import { groupByTerm, sortTerms } from "@/lib/domain/term";
import type { CourseCatalogEntry, PlannedCourse } from "@/lib/validation/plan";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

interface PlanPDFData {
  studentName: string;
  generatedAt: string;
  userPlan: PlannedCourse[];
  catalog: Map<string, CourseCatalogEntry>;
  progress: CategoryProgress[];
  totals: { done: number; inProgress: number; planned: number; total: number };
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 12 },
  statRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  statCell: {
    border: "1pt solid #ddd",
    borderRadius: 4,
    padding: 6,
    flex: 1,
  },
  statLabel: { fontSize: 8, color: "#666", textTransform: "uppercase" },
  statValue: { fontSize: 14, fontWeight: 700, marginTop: 2 },
  termHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f4f4f4",
    padding: 4,
    marginTop: 8,
  },
  termTitle: { fontWeight: 700 },
  courseRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottom: "0.5pt solid #eee",
  },
  cellCode: { width: 80 },
  cellTitle: { flex: 1 },
  cellCredits: { width: 40, textAlign: "right" },
  cellStatus: { width: 80, color: "#666" },
  footer: { fontSize: 8, color: "#999", marginTop: 24, textAlign: "center" },
});

/** Active = not dropped/disc/failed. The PDF only shows active courses. */
function isActive(c: PlannedCourse): boolean {
  return c.status !== "dropped" && c.status !== "disc" && c.status !== "failed";
}

function PlanDocument(props: PlanPDFData): React.ReactElement {
  const byTerm = groupByTerm(props.userPlan, isActive);
  const sortedTerms = sortTerms([...byTerm.keys()]);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>{props.studentName} — SOEN Compass Plan</Text>
        <Text style={styles.subtitle}>
          Generated {props.generatedAt} · BEng Software Engineering · {TOTAL_DEGREE_CREDITS} credits
          required
        </Text>

        <View style={styles.statRow}>
          {[
            { label: "Done", value: props.totals.done },
            { label: "In Progress", value: props.totals.inProgress },
            { label: "Planned", value: props.totals.planned },
            {
              label: "Remaining",
              value: Math.max(
                0,
                props.totals.total -
                  props.totals.done -
                  props.totals.inProgress -
                  props.totals.planned,
              ),
            },
          ].map((s) => (
            <View key={s.label} style={styles.statCell}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value} cr</Text>
            </View>
          ))}
        </View>

        <Text style={styles.h2}>Course Plan</Text>
        {sortedTerms.length === 0 && <Text style={{ color: "#999" }}>No courses planned yet.</Text>}
        {sortedTerms.map((term) => {
          const courses = byTerm.get(term) ?? [];
          const credits = courses.reduce(
            (sum, c) => sum + (props.catalog.get(c.courseCode)?.credits ?? 0),
            0,
          );
          return (
            <View key={term} wrap={false}>
              <View style={styles.termHeader}>
                <Text style={styles.termTitle}>{term}</Text>
                <Text>
                  {credits} cr · {courses.length} courses
                </Text>
              </View>
              {courses.map((c) => {
                const entry = props.catalog.get(c.courseCode);
                return (
                  <View key={`${c.courseCode}-${c.term}`} style={styles.courseRow}>
                    <Text style={styles.cellCode}>{c.courseCode}</Text>
                    <Text style={styles.cellTitle}>{entry?.title ?? "Unknown"}</Text>
                    <Text style={styles.cellCredits}>{entry?.credits ?? "?"}</Text>
                    <Text style={styles.cellStatus}>{c.status}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        <Text style={styles.h2}>Requirements Progress</Text>
        {props.progress.map((cp) => {
          const totalIn = cp.doneCredits + cp.inProgressCredits + cp.plannedCredits;
          return (
            <View key={cp.spec.key} style={styles.courseRow}>
              <Text style={{ flex: 1 }}>{cp.spec.label}</Text>
              <Text style={{ width: 100, textAlign: "right" }}>
                {totalIn} / {cp.spec.requiredCredits} cr
              </Text>
            </View>
          );
        })}

        <Text style={styles.footer}>
          Generated by SOEN Compass · Verify with your academic advisor before registration
        </Text>
      </Page>
    </Document>
  );
}

export async function generatePlanPDF(data: PlanPDFData): Promise<Buffer> {
  return renderToBuffer(<PlanDocument {...data} />);
}
