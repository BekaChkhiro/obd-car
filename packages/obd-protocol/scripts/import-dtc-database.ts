/**
 * Regenerates the DTC description tables from the vendored source data.
 *
 *   pnpm --filter @obd-car/obd-protocol generate:dtcs
 *
 * Source: vendor/dtc-database (MIT, github.com/Wal33D/dtc-database), committed
 * so the import is reproducible and auditable — the generated tables are the
 * only thing the app reads, and a diff on them is reviewable.
 *
 * Two tables come out, and the split is the whole point:
 *
 *   • GENERIC — SAE J2012 codes, identical on every make. Safe to state without
 *     knowing what the car is.
 *   • BY MAKE — the same code number meaning different faults per manufacturer.
 *     P1133 is "Bank 1 Fuel Control Shifted Lean" on a Ford and "O2 Sensor
 *     Heater Control Circuit Bank 2 Sensor 1" on a BMW. Answering one for the
 *     other is not an approximation, it is a wrong diagnosis, so these are only
 *     ever looked up once the make is established.
 *
 * `other_codes.txt` is deliberately NOT imported: it is upstream's bucket for
 * manufacturer-specific codes whose make was not recorded. Folding it into the
 * generic table would relabel brand codes as universal — exactly the confusion
 * this split exists to prevent.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSaeGenericCode } from '../src/dtcs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR = resolve(__dirname, '../vendor/dtc-database');
const SRC_OUT = resolve(__dirname, '../src/generated');
const DATA_OUT = resolve(__dirname, '../data');
// The backend's Docker build copies only `services/backend/src`, so its copy of
// the tables has to live inside that tree. Emitting both from here keeps the
// vendored text the single source of truth — regenerate once, both consumers
// move together.
const BACKEND_OUT = resolve(__dirname, '../../../services/backend/src/app/claude/data');

/** Files holding SAE-generic ranges rather than one manufacturer's table. */
const GENERIC_FILES = new Set(['p_codes.txt', 'b_codes.txt', 'c_codes.txt', 'u_codes.txt']);
/** Upstream's unattributed bucket — see the module comment. */
const EXCLUDED_FILES = new Set(['other_codes.txt']);

const LINE_RE = /^([PBCU][0-9A-F]{4})\s+-\s+(.+)$/i;

interface ParseResult {
  entries: Map<string, string>;
  skipped: string[];
}

function parseFile(path: string): ParseResult {
  const entries = new Map<string, string>();
  const skipped: string[] = [];

  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const match = LINE_RE.exec(line);
    if (!match) {
      skipped.push(line);
      continue;
    }
    const code = match[1]!.toUpperCase();
    const description = match[2]!;
    const clean = description.trim().replace(/\s+/g, ' ');
    // A description that is just another DTC number is a broken cross-reference
    // upstream, not a definition.
    if (!clean || /^[PBCU][0-9A-F]{4}$/i.test(clean)) {
      skipped.push(line);
      continue;
    }
    // First definition wins: the files are ordered, and a later duplicate is a
    // transcription artefact rather than a refinement.
    if (!entries.has(code)) entries.set(code, clean);
  }

  return { entries, skipped };
}

function makeKeyFor(file: string): string {
  return basename(file, '_codes.txt').toUpperCase();
}

function sortedObjectLiteral(entries: Map<string, string>, indent: string): string {
  return [...entries.keys()]
    .sort()
    .map((code) => `${indent}${code}: ${JSON.stringify(entries.get(code)!)},`)
    .join('\n');
}

const HEADER = `// GENERATED FILE — do not edit by hand.
// Run \`pnpm --filter @obd-car/obd-protocol generate:dtcs\` to regenerate.
// Source: vendor/dtc-database (MIT, Copyright (c) 2024 Wal33D / Waleed Judah).
`;

// ── Parse ─────────────────────────────────────────────────────────────────────

const files = readdirSync(VENDOR).filter((f) => f.endsWith('_codes.txt'));
const generic = new Map<string, string>();
const byMake = new Map<string, Map<string, string>>();
const allSkipped: string[] = [];
const misfiled: string[] = [];

for (const file of files.sort()) {
  if (EXCLUDED_FILES.has(file)) continue;
  const { entries, skipped } = parseFile(resolve(VENDOR, file));
  allSkipped.push(...skipped.map((s) => `${file}: ${s}`));

  if (GENERIC_FILES.has(file)) {
    for (const [code, description] of entries) {
      // Upstream's p/b/c/u files are grouped by letter, not by whether the
      // code is actually standardised: they carry 32 P1xxx and 300+ B1/C1/U1
      // entries, several in unmistakably one manufacturer's vocabulary
      // (DPFE, IDM, IMRC — all Ford). Serving those as universal is the exact
      // wrong-make answer this import exists to eliminate, so the code number
      // decides, and anything in a manufacturer range here is dropped.
      if (!isSaeGenericCode(code)) {
        misfiled.push(`${code} (${description})`);
        continue;
      }
      if (!generic.has(code)) generic.set(code, description);
    }
  } else {
    // A manufacturer's file may restate a generic code. Generic wins there by
    // definition, so a make table only ever holds its own codes.
    const own = new Map<string, string>();
    for (const [code, description] of entries) {
      if (!isSaeGenericCode(code)) own.set(code, description);
    }
    byMake.set(makeKeyFor(file), own);
  }
}

// A make-specific entry that merely repeats the generic text carries no
// information and doubles the table for nothing.
let redundant = 0;
for (const table of byMake.values()) {
  for (const [code, description] of [...table]) {
    if (generic.get(code) === description) {
      table.delete(code);
      redundant++;
    }
  }
}

// ── Emit ──────────────────────────────────────────────────────────────────────

writeFileSync(
  resolve(SRC_OUT, 'dtc-generic.ts'),
  `${HEADER}
/** SAE J2012 codes — the same fault on every manufacturer. */
export const GENERIC_DTC_DESCRIPTIONS: Readonly<Record<string, string>> = {
${sortedObjectLiteral(generic, '  ')}
};
`,
  'utf8',
);

const makeBlocks = [...byMake.keys()]
  .sort()
  .map((make) => `  ${make}: {\n${sortedObjectLiteral(byMake.get(make)!, '    ')}\n  },`)
  .join('\n');

writeFileSync(
  resolve(SRC_OUT, 'dtc-by-make.ts'),
  `${HEADER}
/**
 * Manufacturer-specific definitions, keyed by make then code. Only consult a
 * make's table once the make is known — the same number is a different fault
 * on a different brand.
 */
export const MAKE_DTC_DESCRIPTIONS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
${makeBlocks}
};
`,
  'utf8',
);

// The Python backend cannot import TypeScript; it reads these instead.
const genericJson =
  JSON.stringify(Object.fromEntries([...generic].sort(([a], [b]) => a.localeCompare(b))), null, 0) +
  '\n';
const byMakeJson =
  JSON.stringify(
    Object.fromEntries(
      [...byMake.keys()].sort().map((make) => [
        make,
        Object.fromEntries([...byMake.get(make)!].sort(([a], [b]) => a.localeCompare(b))),
      ]),
    ),
    null,
    0,
  ) + '\n';

for (const dir of [DATA_OUT, BACKEND_OUT]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'dtc-generic.json'), genericJson, 'utf8');
  writeFileSync(resolve(dir, 'dtc-by-make.json'), byMakeJson, 'utf8');
}

// ── Report ────────────────────────────────────────────────────────────────────

const makeTotal = [...byMake.values()].reduce((n, t) => n + t.size, 0);
console.log(`generic codes      : ${generic.size}`);
console.log(`manufacturers      : ${byMake.size}`);
console.log(`make-specific codes: ${makeTotal} (dropped ${redundant} that repeated the generic text)`);
console.log(`dropped from generic: ${misfiled.length} code(s) whose number is in a manufacturer range`);
if (allSkipped.length) {
  console.log(`\nskipped ${allSkipped.length} malformed line(s):`);
  for (const line of allSkipped) console.log(`  ${line}`);
}
