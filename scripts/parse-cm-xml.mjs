/**
 * parse-cm-xml.mjs
 *
 * Parses the ICD-10-CM tabular XML file and outputs two JSON files:
 *   1. src/data/icd10cm-index.json   - lightweight array of all codes
 *   2. src/data/icd10cm-details.json  - rich object keyed by code
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
  'ICD 10 CM-20260308T020958Z-1-001/ICD 10 CM',
  'april-1-2026-code-tables-tabular-and-index/Table and Index_ Not Complete',
  'icd10cm_tabular_2026.xml'
);

// ── ensure output directory ────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });

// ── tags that should always parse as arrays ────────────────────────────────────
const ARRAY_TAGS = new Set([
  'chapter', 'section', 'diag', 'note', 'sectionRef',
]);

// ── parse XML ──────────────────────────────────────────────────────────────────
console.log('Reading XML file...');
const xmlData = readFileSync(XML_PATH, 'utf-8');
console.log(`  File size: ${(xmlData.length / 1024 / 1024).toFixed(1)} MB`);

console.log('Parsing XML...');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
  parseTagValue: true,
  trimValues: true,
  // Prevent numeric parsing of code names like "001" -> 1
  numberParseOptions: {
    hex: false,
    leadingZeros: false,
    eNotation: false,
  },
});
const parsed = parser.parse(xmlData);
const root = parsed['ICD10CM.tabular'];
const chapters = root.chapter;

console.log(`  Found ${chapters.length} chapters`);

// ── output containers ──────────────────────────────────────────────────────────
const index = [];     // lightweight code list
const details = {};   // rich code details keyed by code string

// ── helpers ────────────────────────────────────────────────────────────────────
function ensureArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function extractNotes(container) {
  if (!container) return [];
  const notes = ensureArray(container.note);
  return notes.map(n => (typeof n === 'object' ? String(n['#text'] ?? '') : String(n)).trim()).filter(Boolean);
}

function extractSingleNote(container) {
  const notes = extractNotes(container);
  return notes.length > 0 ? notes.join('; ') : null;
}

// ── recursive diag walker ──────────────────────────────────────────────────────
function processDiag(diag, chapterNum, chapterDesc, sectionId, sectionDesc, parentCode) {
  const code = String(diag.name).trim();
  const desc = String(diag.desc).trim();
  const children = ensureArray(diag.diag);
  const billable = children.length === 0;

  // Build index entry
  index.push({
    code,
    desc,
    chapter: chapterNum,
    billable,
  });

  // Build detail entry
  const detail = {
    code,
    desc,
    chapter: chapterNum,
    chapterDesc,
    section: sectionId,
    sectionDesc,
    billable,
    parent: parentCode,
    children: children.map(c => String(c.name).trim()),
    includes: extractNotes(diag.includes),
    inclusionTerm: extractNotes(diag.inclusionTerm),
    excludes1: extractNotes(diag.excludes1),
    excludes2: extractNotes(diag.excludes2),
    codeFirst: extractSingleNote(diag.codeFirst),
    useAdditionalCode: extractSingleNote(diag.useAdditionalCode),
    codeAlso: extractSingleNote(diag.codeAlso),
  };

  details[code] = detail;

  // Recurse into child diags
  for (const child of children) {
    processDiag(child, chapterNum, chapterDesc, sectionId, sectionDesc, code);
  }
}

// ── walk chapters → sections → diags ───────────────────────────────────────────
for (const chapter of chapters) {
  const chapterNum = parseInt(String(chapter.name).trim(), 10);
  const chapterDesc = String(chapter.desc).trim();

  const sections = ensureArray(chapter.section);
  for (const section of sections) {
    const sectionId = section['@_id'];
    // Strip trailing parenthetical range from section desc, e.g. "(A00-A09)"
    const sectionDesc = String(section.desc).trim().replace(/\s*\([A-Z0-9]+-[A-Z0-9]+\)\s*$/, '').trim();

    const diags = ensureArray(section.diag);
    for (const diag of diags) {
      processDiag(diag, chapterNum, chapterDesc, sectionId, sectionDesc, null);
    }
  }
}

// ── write output ───────────────────────────────────────────────────────────────
const indexPath = resolve(DATA_DIR, 'icd10cm-index.json');
const detailsPath = resolve(DATA_DIR, 'icd10cm-details.json');

console.log(`\nWriting ${index.length} codes to index...`);
writeFileSync(indexPath, JSON.stringify(index));
console.log(`  -> ${indexPath}`);

console.log(`Writing ${Object.keys(details).length} code details...`);
writeFileSync(detailsPath, JSON.stringify(details));
console.log(`  -> ${detailsPath}`);

// ── summary stats ──────────────────────────────────────────────────────────────
const billableCount = index.filter(c => c.billable).length;
const nonBillableCount = index.length - billableCount;
console.log(`\nDone!`);
console.log(`  Total codes:    ${index.length}`);
console.log(`  Billable:       ${billableCount}`);
console.log(`  Non-billable:   ${nonBillableCount}`);
console.log(`  Chapters:       ${chapters.length}`);
