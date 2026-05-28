#!/usr/bin/env bash
# Guard against the "drizzle sql tag + JS array" footgun.
#
# Drizzle's `sql\`... ANY(${array})\`` and `sql\`... IN (${array})\`` patterns
# look correct but explode each array element into its own placeholder, which
# Postgres rejects with: "op ANY/ALL (array) requires array on right side".
#
# Always use `inArray(column, jsArray)` from drizzle-orm instead.
#
# Real-world sql tags span multiple lines, so we delegate to a Node scanner
# that joins file content and matches across newlines.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ node not found — required for the multi-line SQL pattern scan."
  exit 1
fi

node - "$@" <<'EOF'
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts"];
const SKIP_RE = /(\/|^)(node_modules|\.next|drizzle|coverage)(\/|$)/;
const PATTERNS = [
  { name: "ANY(${jsArray})", re: /sql`[\s\S]*?\bANY\s*\(\s*\$\{[^}]+\}\s*\)/g },
  { name: "ALL(${jsArray})", re: /sql`[\s\S]*?\bALL\s*\(\s*\$\{[^}]+\}\s*\)/g },
  { name: "IN (${jsArray})",  re: /sql`[\s\S]*?\bIN\s*\(\s*\$\{[^}]+\}\s*\)/g },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (SKIP_RE.test(`/${rel}/`)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(name)) {
      yield full;
    }
  }
}

let found = 0;
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const content = readFileSync(file, "utf8");
    for (const pat of PATTERNS) {
      let m;
      pat.re.lastIndex = 0;
      while ((m = pat.re.exec(content)) !== null) {
        const before = content.slice(0, m.index);
        const line = before.split("\n").length;
        const snippet = m[0].slice(0, 100).replace(/\n/g, " ⏎ ");
        console.log(`✗ ${relative(ROOT, file)}:${line}  drizzle sql-tag misuse [${pat.name}]`);
        console.log(`    ${snippet}${m[0].length > 100 ? "…" : ""}`);
        found++;
      }
    }
  }
}

if (found === 0) {
  console.log("✓ No drizzle sql-tag array misuse detected (multi-line scan).");
  process.exit(0);
}
console.log("");
console.log(`Found ${found} occurrence${found === 1 ? "" : "s"}. Use \`inArray(column, jsArray)\` from drizzle-orm instead.`);
process.exit(1);
EOF
