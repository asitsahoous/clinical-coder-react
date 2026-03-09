/**
 * HCPCS 2026 Data Parser
 *
 * Parses the CMS HCPCS 2026 fixed-width (320-char) contractor record file
 * into structured JSON for the clinical coder application.
 *
 * Record Layout (HCPCS Contractor Record - 320 chars):
 *   Pos 1-5:     HCPCS Code (5 chars)
 *   Pos 6-10:    Sequence Number (5 chars numeric)
 *   Pos 11:      Record ID (3=first proc, 4=cont proc, 7=first modifier, 8=cont modifier)
 *   Pos 12-91:   Long Description (80 chars)
 *   Pos 92-119:  Short Description (28 chars)
 *   Pos 120-121: Pricing Indicator Code (2 chars)
 *   Pos 128:     Multiple Pricing Indicator (1 char)
 *   Pos 230:     Coverage Code (C/D/I/M/S)
 *   Pos 231-232: ASC Payment Group (2 chars)
 *   Pos 253-256: Processing Note Number (4 chars)
 *   Pos 257-259: BETOS Code (3 chars)
 *   Pos 261:     Type of Service (1 char)
 *   Pos 266-268: Anesthesia Base Units (3 chars)
 *   Pos 269-276: Code Added Date (YYYYMMDD)
 *   Pos 277-284: Action Effective Date (YYYYMMDD)
 *   Pos 285-292: Termination Date (YYYYMMDD)
 *   Pos 293:     Action Code (1 char: A/B/C/D/F/N/P/R/S/T)
 *
 * Usage: node scripts/parse-hcpcs.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HCPCS_FILE = 'C:\\Users\\asits\\Desktop\\CLAUDE.ME\\Clinical Coder Documents\\hcpc2026_jan_anweb_01122026\\HCPC2026_JAN_ANWEB_01122026.txt';
const NOTES_FILE = 'C:\\Users\\asits\\Desktop\\CLAUDE.ME\\Clinical Coder Documents\\hcpc2026_jan_anweb_01122026\\proc_notes_JAN2026.txt';
const OUTPUT_DIR = resolve(__dirname, '..', 'src', 'data');

// Fixed-width field extraction (1-indexed positions)
function extract(line, start, end) {
  // Convert 1-indexed to 0-indexed
  return line.substring(start - 1, end).trim();
}

function extractRaw(line, start, end) {
  return line.substring(start - 1, end);
}

// Parse processing notes file
function parseProcessingNotes() {
  console.log('Parsing processing notes...');
  const content = readFileSync(NOTES_FILE, 'utf-8');
  const lines = content.split('\n');
  const notes = {};
  let currentNoteNum = null;
  let currentNoteText = [];

  for (const line of lines) {
    // Match note header: spaces + 4-digit number + "--" + text
    const noteMatch = line.match(/^\s+(\d{4})--(.+?)(\s*\*\s*)?$/);
    if (noteMatch) {
      // Save previous note
      if (currentNoteNum !== null) {
        notes[parseInt(currentNoteNum)] = currentNoteText.join(' ').trim();
      }
      currentNoteNum = noteMatch[1];
      currentNoteText = [noteMatch[2].trim()];
    } else if (currentNoteNum !== null) {
      // Continuation line
      const contMatch = line.match(/^\s{16}(.+?)(\s*\*\s*)?$/);
      if (contMatch) {
        currentNoteText.push(contMatch[1].trim());
      } else if (line.trim() === '' || line.trim() === '*') {
        // Blank line between notes
      }
    }
  }
  // Save last note
  if (currentNoteNum !== null) {
    notes[parseInt(currentNoteNum)] = currentNoteText.join(' ').trim();
  }

  console.log(`  Parsed ${Object.keys(notes).length} processing notes`);
  return notes;
}

// Determine HCPCS code category
function getCodeCategory(code) {
  const first = code.charAt(0);
  const categories = {
    'A': 'Transport, Medical/Surgical Supplies, Miscellaneous',
    'B': 'Enteral and Parenteral Therapy',
    'C': 'Outpatient PPS (Temporary)',
    'D': 'Dental Procedures',
    'E': 'Durable Medical Equipment',
    'G': 'Procedures/Professional Services (Temporary)',
    'H': 'Alcohol and Drug Abuse Treatment',
    'J': 'Drugs Administered Other Than Oral Method',
    'K': 'Durable Medical Equipment (Temporary)',
    'L': 'Orthotics and Prosthetics',
    'M': 'Medical Services',
    'P': 'Pathology and Laboratory',
    'Q': 'Miscellaneous Services (Temporary)',
    'R': 'Diagnostic Radiology',
    'S': 'Temporary National Codes (Non-Medicare)',
    'T': 'National Codes for State Medicaid Agencies',
    'U': 'Coronavirus-Related Services (Temporary)',
    'V': 'Vision, Hearing, Speech-Language Services',
  };
  return categories[first] || 'Other';
}

// Check if a code is a CPT code (numeric-only, AMA copyrighted)
function isCPTCode(code) {
  return /^\d{5}$/.test(code);
}

// Parse the main HCPCS data file
function parseHCPCSData(processingNotes) {
  console.log('Parsing HCPCS data file...');
  const content = readFileSync(HCPCS_FILE, 'utf-8');
  const lines = content.split('\n');

  const procedures = {};  // code -> procedure record
  const modifiers = {};   // modifier code -> modifier record

  let currentProcCode = null;
  let currentModCode = null;
  let lineCount = 0;
  let procCount = 0;
  let modCount = 0;
  let cptSkipped = 0;

  for (const line of lines) {
    if (line.length < 11) continue; // Skip short/empty lines
    lineCount++;

    const recType = line.charAt(10); // Position 11 (0-indexed: 10)
    const codeField = extractRaw(line, 1, 5); // 5-char code field
    const seqNum = extract(line, 6, 10);
    const longDescPart = extract(line, 12, 91);

    if (recType === '3') {
      // First line of procedure record
      const code = codeField.trim();
      if (!code) continue;

      // Check if CPT (numeric-only) — skip display but note existence
      if (isCPTCode(code)) {
        cptSkipped++;
        currentProcCode = null; // Don't accumulate continuation lines
        continue;
      }

      const shortDesc = extract(line, 92, 119);
      const pricingIndicator = extract(line, 120, 121);
      const multiplePricing = extract(line, 128, 128);
      const coverageCode = extract(line, 230, 230);
      const ascGroup = extract(line, 231, 232);
      const procNoteNum = extract(line, 253, 256);
      const betos = extract(line, 257, 259);
      const typeOfService = extract(line, 261, 261);
      const anesthesiaUnits = extract(line, 266, 268);
      const codeAddedDate = extract(line, 269, 276);
      const actionEffDate = extract(line, 277, 284);
      const terminationDate = extract(line, 285, 292);
      const actionCode = extract(line, 293, 293);

      const noteNum = procNoteNum ? parseInt(procNoteNum) : null;

      procedures[code] = {
        code,
        longDesc: longDescPart,
        shortDesc,
        category: getCodeCategory(code),
        pricingIndicator: pricingIndicator || null,
        multiplePricing: multiplePricing || null,
        coverageCode: coverageCode || null,
        ascGroup: ascGroup || null,
        betos: betos || null,
        typeOfService: typeOfService || null,
        anesthesiaUnits: anesthesiaUnits ? parseInt(anesthesiaUnits) : null,
        codeAddedDate: codeAddedDate || null,
        actionEffDate: actionEffDate || null,
        terminationDate: terminationDate || null,
        actionCode: actionCode || null,
        processingNote: (noteNum && processingNotes[noteNum]) ? processingNotes[noteNum] : null,
        processingNoteNum: noteNum,
      };
      currentProcCode = code;
      procCount++;

    } else if (recType === '4') {
      // Continuation of procedure description
      if (currentProcCode && procedures[currentProcCode]) {
        const contDesc = extract(line, 12, 91);
        if (contDesc) {
          procedures[currentProcCode].longDesc += ' ' + contDesc;
        }
      }

    } else if (recType === '7') {
      // First line of modifier record
      const modCode = extract(line, 4, 5); // Positions 4-5 are modifier code
      if (!modCode) continue;

      // Skip numeric-only modifiers (CPT Level I modifiers)
      if (/^\d{2}$/.test(modCode)) {
        cptSkipped++;
        currentModCode = null;
        continue;
      }

      const shortDesc = extract(line, 92, 119);
      const procNoteNum = extract(line, 253, 256);
      const noteNum = procNoteNum ? parseInt(procNoteNum) : null;

      modifiers[modCode] = {
        code: modCode,
        longDesc: longDescPart,
        shortDesc,
        processingNote: (noteNum && processingNotes[noteNum]) ? processingNotes[noteNum] : null,
      };
      currentModCode = modCode;
      modCount++;

    } else if (recType === '8') {
      // Continuation of modifier description
      if (currentModCode && modifiers[currentModCode]) {
        const contDesc = extract(line, 12, 91);
        if (contDesc) {
          modifiers[currentModCode].longDesc += ' ' + contDesc;
        }
      }
    }
  }

  console.log(`  Total lines processed: ${lineCount}`);
  console.log(`  HCPCS Level II procedures: ${procCount}`);
  console.log(`  HCPCS Level II modifiers: ${modCount}`);
  console.log(`  CPT codes skipped (AMA copyright): ${cptSkipped}`);

  return { procedures, modifiers };
}

// Build the output JSON
function buildOutput(procedures, modifiers) {
  // Procedure index (for search + browse)
  const procArray = Object.values(procedures).map(p => ({
    code: p.code,
    desc: p.longDesc,
    shortDesc: p.shortDesc,
    category: p.category,
    pricing: p.pricingIndicator,
    coverage: p.coverageCode,
    ascGroup: p.ascGroup,
    betos: p.betos,
    tos: p.typeOfService,
    effectiveDate: p.actionEffDate,
    terminationDate: p.terminationDate,
    actionCode: p.actionCode,
    note: p.processingNote,
  }));

  // Sort by code
  procArray.sort((a, b) => a.code.localeCompare(b.code));

  // Modifier index
  const modArray = Object.values(modifiers).map(m => ({
    code: m.code,
    desc: m.longDesc,
    shortDesc: m.shortDesc,
    note: m.processingNote,
  }));

  modArray.sort((a, b) => a.code.localeCompare(b.code));

  // Category summary
  const categoryCounts = {};
  procArray.forEach(p => {
    const cat = p.category;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  return { procedures: procArray, modifiers: modArray, categoryCounts };
}

// Main
function main() {
  console.log('=== HCPCS 2026 Data Parser ===\n');

  // Step 1: Parse processing notes
  const notes = parseProcessingNotes();

  // Step 2: Parse main HCPCS file
  const { procedures, modifiers } = parseHCPCSData(notes);

  // Step 3: Build output
  const output = buildOutput(procedures, modifiers);

  console.log(`\nCategory breakdown:`);
  for (const [cat, count] of Object.entries(output.categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Step 4: Write output files
  const hcpcsIndexPath = resolve(OUTPUT_DIR, 'hcpcs-index.json');
  writeFileSync(hcpcsIndexPath, JSON.stringify(output.procedures));
  console.log(`\nWrote ${output.procedures.length} procedures to ${hcpcsIndexPath}`);
  console.log(`  File size: ${(readFileSync(hcpcsIndexPath).length / 1024 / 1024).toFixed(2)} MB`);

  const hcpcsModifiersPath = resolve(OUTPUT_DIR, 'hcpcs-modifiers.json');
  writeFileSync(hcpcsModifiersPath, JSON.stringify(output.modifiers));
  console.log(`Wrote ${output.modifiers.length} modifiers to ${hcpcsModifiersPath}`);

  // Summary stats
  console.log(`\n=== Summary ===`);
  console.log(`  HCPCS Level II Procedures: ${output.procedures.length}`);
  console.log(`  HCPCS Level II Modifiers: ${output.modifiers.length}`);
  console.log(`  Categories: ${Object.keys(output.categoryCounts).length}`);
  console.log(`\nDone!`);
}

main();
