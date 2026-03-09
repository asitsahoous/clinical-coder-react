/**
 * parse-pcs-xml.mjs
 *
 * Parses the ICD-10-PCS tables XML file and outputs two JSON files:
 *   1. src/data/icd10pcs-index.json   - array of all generated 7-character codes
 *   2. src/data/icd10pcs-tables.json   - table structure for the PCS code browser
 */

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ── paths ──────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(PROJECT_ROOT, 'src', 'data');

const XML_PATH = resolve(
  'C:/Users/asits/Desktop/CLAUDE.ME/Clinical Coder Documents',
  'ICD 10 PCS-20260308T020953Z-1-001/ICD 10 PCS',
  'zip-file-2-2026-code-tables-and-index',
  'icd10pcs_tables_2026.xml'
);

// ── ensure output directory ────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });

// ── tags that should always parse as arrays ────────────────────────────────────
const ARRAY_TAGS = new Set([
  'pcsTable', 'pcsRow', 'axis', 'label',
]);

// ── parse XML ──────────────────────────────────────────────────────────────────
console.log('Reading PCS XML file...');
const xmlData = readFileSync(XML_PATH, 'utf-8');
console.log(`  File size: ${(xmlData.length / 1024 / 1024).toFixed(1)} MB`);

console.log('Parsing XML...');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
  parseTagValue: true,
  trimValues: true,
  numberParseOptions: {
    hex: false,
    leadingZeros: false,
    eNotation: false,
  },
});
const parsed = parser.parse(xmlData);
const root = parsed['ICD10PCS.tabular'];
const pcsTables = root.pcsTable;

console.log(`  Found ${pcsTables.length} PCS tables`);

// ── helpers ────────────────────────────────────────────────────────────────────
function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Extract labels from an axis element.
 * Each label has @_code attribute and text content.
 */
function getLabels(axis) {
  const labels = ensureArray(axis.label);
  return labels.map(label => {
    // label can be a string (if only text) or an object with @_code and #text
    if (typeof label === 'object' && label !== null) {
      return {
        code: String(label['@_code']),
        desc: String(label['#text'] ?? '').trim(),
      };
    }
    // Fallback: shouldn't happen with ignoreAttributes: false
    return { code: '', desc: String(label).trim() };
  });
}

/**
 * Find axis by position number from an array of axis elements.
 */
function findAxis(axes, pos) {
  return axes.find(a => String(a['@_pos']) === String(pos));
}

/**
 * Build a PCS code description.
 * Format: "{operation} {bodyPart}, {approach} Approach"
 *   with optional device and qualifier additions.
 */
function buildDescription(operation, bodyPart, approach, device, qualifier) {
  const parts = [operation, bodyPart];

  // Add qualifier context if meaningful
  if (qualifier && qualifier !== 'No Qualifier') {
    parts.push('to ' + qualifier);
  }

  // Add device if meaningful
  if (device && device !== 'No Device') {
    parts.push('with ' + device);
  }

  // Add approach
  if (approach && approach !== 'External') {
    parts.push(approach + ' Approach');
  } else if (approach === 'External') {
    parts.push('External Approach');
  }

  return parts.join(', ');
}

// ── output containers ──────────────────────────────────────────────────────────
const indexCodes = [];   // all generated 7-char codes
const tables = [];       // table structures for browser

// ── process each PCS table ─────────────────────────────────────────────────────
let tableCount = 0;
for (const table of pcsTables) {
  tableCount++;
  const tableAxes = ensureArray(table.axis);
  const rows = ensureArray(table.pcsRow);

  // Table-level axes: positions 1, 2, 3
  const axis1 = findAxis(tableAxes, 1);
  const axis2 = findAxis(tableAxes, 2);
  const axis3 = findAxis(tableAxes, 3);

  if (!axis1 || !axis2 || !axis3) {
    console.warn(`  Table ${tableCount}: missing table-level axis, skipping`);
    continue;
  }

  const sectionLabels = getLabels(axis1);
  const bodySystemLabels = getLabels(axis2);
  const operationLabels = getLabels(axis3);

  // Usually each table has one section, one body system, one operation
  const section = sectionLabels[0];
  const bodySystem = bodySystemLabels[0];
  const operation = operationLabels[0];

  // Extract operation definition if present
  const operationDefinition = axis3.definition ? String(axis3.definition).trim() : null;

  // Build table structure for browser
  const tableEntry = {
    section: { code: section.code, desc: section.desc },
    bodySystem: { code: bodySystem.code, desc: bodySystem.desc },
    operation: {
      code: operation.code,
      desc: operation.desc,
      ...(operationDefinition ? { definition: operationDefinition } : {}),
    },
    rows: [],
  };

  // Fixed code prefix: section + bodySystem + operation
  const codePrefix = section.code + bodySystem.code + operation.code;

  // Process each row
  for (const row of rows) {
    const rowAxes = ensureArray(row.axis);

    const axis4 = findAxis(rowAxes, 4);
    const axis5 = findAxis(rowAxes, 5);
    const axis6 = findAxis(rowAxes, 6);
    const axis7 = findAxis(rowAxes, 7);

    if (!axis4 || !axis5 || !axis6 || !axis7) {
      console.warn(`  Table ${tableCount}: row missing axis, skipping`);
      continue;
    }

    const bodyParts = getLabels(axis4);
    const approaches = getLabels(axis5);
    const devices = getLabels(axis6);
    const qualifiers = getLabels(axis7);

    // Add row to table structure
    tableEntry.rows.push({
      bodyParts,
      approaches,
      devices,
      qualifiers,
    });

    // Generate all code combinations
    for (const bp of bodyParts) {
      for (const ap of approaches) {
        for (const dv of devices) {
          for (const ql of qualifiers) {
            const code = codePrefix + bp.code + ap.code + dv.code + ql.code;
            const desc = buildDescription(
              operation.desc,
              bp.desc,
              ap.desc,
              dv.desc,
              ql.desc
            );
            indexCodes.push({
              code,
              desc,
              section: section.desc,
              bodySystem: bodySystem.desc,
              operation: operation.desc,
              billable: true,
            });
          }
        }
      }
    }
  }

  tables.push(tableEntry);

  if (tableCount % 100 === 0) {
    console.log(`  Processed ${tableCount} tables, ${indexCodes.length} codes so far...`);
  }
}

// ── write output ───────────────────────────────────────────────────────────────
const indexPath = resolve(DATA_DIR, 'icd10pcs-index.json');
const tablesPath = resolve(DATA_DIR, 'icd10pcs-tables.json');

console.log(`\nWriting ${indexCodes.length} PCS codes to index...`);
writeFileSync(indexPath, JSON.stringify(indexCodes));
console.log(`  -> ${indexPath}`);

console.log(`Writing ${tables.length} PCS tables...`);
writeFileSync(tablesPath, JSON.stringify(tables));
console.log(`  -> ${tablesPath}`);

// ── summary stats ──────────────────────────────────────────────────────────────
console.log(`\nDone!`);
console.log(`  Total PCS codes: ${indexCodes.length}`);
console.log(`  Total tables:    ${tables.length}`);

// Show some section distribution
const sectionCounts = {};
for (const code of indexCodes) {
  sectionCounts[code.section] = (sectionCounts[code.section] || 0) + 1;
}
console.log(`\n  Codes by section:`);
for (const [sec, count] of Object.entries(sectionCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`    ${sec}: ${count}`);
}
