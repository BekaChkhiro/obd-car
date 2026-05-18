import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBD_TOOL_SCHEMAS } from '../src/tool-schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../schemas/obd-tools.json');

writeFileSync(outPath, JSON.stringify(OBD_TOOL_SCHEMAS, null, 2) + '\n', 'utf8');
console.log(`Wrote ${OBD_TOOL_SCHEMAS.length} tool schemas → ${outPath}`);
