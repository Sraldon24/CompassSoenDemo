/**
 * iCalendar (.ics) generator for term deadlines and key dates.
 *
 * Minimal RFC 5545-compatible output. We escape commas/semicolons/newlines
 * per the spec and use VALUE=DATE for all-day events.
 */

export interface ICSEvent {
  uid: string;
  summary: string;
  description?: string;
  /** ISO date (YYYY-MM-DD) — generates VALUE=DATE for all-day events. */
  date: string;
  /** Optional URL link in description. */
  url?: string;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function asDateValue(iso: string): string {
  return iso.replace(/-/g, "");
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function buildICS(calendarName: string, events: ICSEvent[]): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//SOEN Compass//Plan Export//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push(`X-WR-CALNAME:${escapeText(calendarName)}`);

  const ts = stamp();
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}@compass-soen`);
    lines.push(`DTSTAMP:${ts}`);
    lines.push(`DTSTART;VALUE=DATE:${asDateValue(e.date)}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) {
      lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    }
    if (e.url) {
      lines.push(`URL:${e.url}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const TERM_START_DATES: Record<string, string> = {
  Fall: "09-04",
  Winter: "01-08",
  Summer: "05-06",
};

/**
 * Best-effort start date for a labeled term like "Fall 2026" → 2026-09-04.
 * Real Concordia dates vary slightly year-to-year — close enough for a calendar
 * placeholder, the user adjusts in their calendar app.
 */
export function termToStartDate(termLabel: string): string | null {
  const m = termLabel.match(/^(Fall|Winter|Summer)\s+(\d{4})$/);
  if (!m || !m[1] || !m[2]) return null;
  const season = m[1] as keyof typeof TERM_START_DATES;
  return `${m[2]}-${TERM_START_DATES[season]}`;
}
