/**
 * CMS Completeness Checker — 8 Official Checks from CMS Job Aid
 *
 * Per "Procedure Coding: Using the ICD-10-CM Job Aid":
 * After verifying a code in the Tabular List, these completeness checks
 * must pass before a code can be accepted as final.
 *
 * 1. BILLABLE — Is this the most specific code (leaf node, no children)?
 * 2. LATERALITY — Does the code require left/right/bilateral specification?
 * 3. 7TH CHARACTER — Does the code need a 7th character extension?
 * 4. X PLACEHOLDER — If code <6 chars and needs 7th char, are X placeholders used?
 * 5. EXCLUDES1 — Does this code conflict with any other assigned code?
 * 6. EXCLUDES2 — Are there overlapping codes that might also apply?
 * 7. CODE FIRST / USE ADDITIONAL CODE — Is proper sequencing followed?
 * 8. COMBINATION CODE — Is there a single code that captures both conditions?
 */

import type {
  ICD10CMDetail,
  CompletenessResult,
  CompletenessCheck,
  ICD10IndexEntry,
  CrossValidationResult,
} from '@/types/icd10';

// ============================================================================
// Single Code Completeness Checks
// ============================================================================

export function runCompletenessChecks(
  code: string,
  detail: ICD10CMDetail | undefined,
  allAssignedCodes: string[],
  allDetails: Record<string, ICD10CMDetail>,
  documentText: string
): CompletenessResult {
  const checks: CompletenessCheck[] = [];

  // Check 1: BILLABLE
  checks.push(checkBillable(code, detail));

  // Check 2: LATERALITY
  checks.push(checkLaterality(code, detail, documentText));

  // Check 3: 7TH CHARACTER
  checks.push(checkSeventhCharacter(code, detail));

  // Check 4: X PLACEHOLDER
  checks.push(checkXPlaceholder(code, detail));

  // Check 5: EXCLUDES1
  checks.push(checkExcludes1(code, detail, allAssignedCodes, allDetails));

  // Check 6: EXCLUDES2
  checks.push(checkExcludes2(code, detail, allAssignedCodes, allDetails));

  // Check 7: CODE FIRST / USE ADDITIONAL CODE
  checks.push(checkCodeFirst(code, detail, allAssignedCodes));

  // Check 8: COMBINATION CODE
  checks.push(checkCombinationCode(code, detail, allAssignedCodes, allDetails, documentText));

  const passedCount = checks.filter((c) => c.passed).length;

  return {
    checks,
    allPassed: passedCount === checks.length,
    passedCount,
    totalChecks: checks.length,
  };
}

// ============================================================================
// Check 1: BILLABLE (Most Specific Code)
// ============================================================================

function checkBillable(code: string, detail: ICD10CMDetail | undefined): CompletenessCheck {
  if (!detail) {
    // PCS codes are always billable (7 chars)
    if (code.length === 7 && /^[A-Z0-9]{7}$/.test(code)) {
      return {
        id: 'billable',
        name: 'Billable Code',
        passed: true,
        severity: 'info',
        message: 'PCS code is fully specified (7 characters)',
      };
    }
    return {
      id: 'billable',
      name: 'Billable Code',
      passed: true,
      severity: 'info',
      message: 'Code details not available for verification',
    };
  }

  if (detail.billable) {
    return {
      id: 'billable',
      name: 'Billable Code',
      passed: true,
      severity: 'info',
      message: `${code} is a valid billable code (no more specific codes exist)`,
    };
  }

  return {
    id: 'billable',
    name: 'Billable Code',
    passed: false,
    severity: 'error',
    message: `${code} is a CATEGORY code, NOT billable`,
    details: `This code has ${detail.children.length} child code(s) that are more specific. You must select the most specific code available.`,
    suggestedFix: `Review child codes: ${detail.children.slice(0, 5).join(', ')}${detail.children.length > 5 ? '...' : ''}`,
  };
}

// ============================================================================
// Check 2: LATERALITY
// ============================================================================

const LATERALITY_BODY_PARTS = [
  'eye', 'ear', 'arm', 'hand', 'finger', 'wrist', 'elbow', 'shoulder',
  'leg', 'foot', 'toe', 'ankle', 'knee', 'hip', 'femur', 'tibia', 'fibula',
  'radius', 'ulna', 'humerus', 'lung', 'kidney', 'ovary', 'breast',
  'rib', 'clavicle', 'scapula', 'patella', 'calcaneus', 'metacarpal',
  'metatarsal', 'phalanx', 'carpal',
];

function checkLaterality(code: string, detail: ICD10CMDetail | undefined, documentText: string): CompletenessCheck {
  if (!detail) {
    return { id: 'laterality', name: 'Laterality', passed: true, severity: 'info', message: 'No laterality check needed' };
  }

  const descLower = detail.desc.toLowerCase();
  const hasLateralPart = LATERALITY_BODY_PARTS.some((part) => descLower.includes(part));

  if (!hasLateralPart) {
    return { id: 'laterality', name: 'Laterality', passed: true, severity: 'info', message: 'Code does not require laterality specification' };
  }

  // Check if the description already specifies laterality
  const hasSpecifiedLaterality =
    descLower.includes(', right') || descLower.includes(', left') || descLower.includes(', bilateral') ||
    descLower.includes('right ') || descLower.includes('left ') || descLower.includes('bilateral');

  if (hasSpecifiedLaterality) {
    return { id: 'laterality', name: 'Laterality', passed: true, severity: 'info', message: 'Laterality is specified in the code' };
  }

  // Check if "unspecified" side
  if (descLower.includes('unspecified')) {
    // Check if the document specifies laterality
    const textLower = documentText.toLowerCase();
    const hasDocLaterality = textLower.includes('right') || textLower.includes('left') || textLower.includes('bilateral');

    if (hasDocLaterality) {
      return {
        id: 'laterality',
        name: 'Laterality',
        passed: false,
        severity: 'warning',
        message: 'Code uses "unspecified" laterality but documentation may specify a side',
        details: 'The clinical documentation appears to mention laterality. Review to select the side-specific code.',
        suggestedFix: 'Review documentation for left/right/bilateral and select the corresponding specific code',
      };
    }
  }

  // Has a lateral body part but uses unspecified
  if (descLower.includes('unspecified') && hasLateralPart) {
    return {
      id: 'laterality',
      name: 'Laterality',
      passed: false,
      severity: 'warning',
      message: 'Unspecified laterality — review clinical documentation',
      suggestedFix: 'Query the provider for laterality if not documented',
    };
  }

  return { id: 'laterality', name: 'Laterality', passed: true, severity: 'info', message: 'Laterality check passed' };
}

// ============================================================================
// Check 3: 7TH CHARACTER
// ============================================================================

function checkSeventhCharacter(code: string, detail: ICD10CMDetail | undefined): CompletenessCheck {
  if (!detail) {
    return { id: 'seventh_char', name: '7th Character', passed: true, severity: 'info', message: 'No 7th character check needed' };
  }

  // If the code has 7th character definitions
  if (detail.sevenChrDef && Object.keys(detail.sevenChrDef).length > 0) {
    const codeBase = code.replace(/\./g, '');
    if (codeBase.length >= 7) {
      const seventh = codeBase[6];
      const validChars = Object.keys(detail.sevenChrDef);
      if (validChars.includes(seventh)) {
        return {
          id: 'seventh_char',
          name: '7th Character',
          passed: true,
          severity: 'info',
          message: `7th character '${seventh}' = ${detail.sevenChrDef[seventh]}`,
        };
      } else {
        return {
          id: 'seventh_char',
          name: '7th Character',
          passed: false,
          severity: 'error',
          message: `Invalid 7th character '${seventh}'`,
          details: `Valid options: ${validChars.map(c => `${c} (${detail.sevenChrDef![c]})`).join(', ')}`,
          suggestedFix: 'Select the appropriate 7th character for this encounter',
        };
      }
    } else {
      return {
        id: 'seventh_char',
        name: '7th Character',
        passed: false,
        severity: 'error',
        message: 'Code requires a 7th character extension',
        details: `Available extensions: ${Object.entries(detail.sevenChrDef).map(([k, v]) => `${k} (${v})`).join(', ')}`,
        suggestedFix: 'Add the appropriate 7th character: A=initial encounter, D=subsequent, S=sequela',
      };
    }
  }

  // Check parent for 7th char definitions (inherited)
  // We check if the code's parent or ancestors have sevenChrDef
  // This is a simplified check — in production, walk up the tree
  const codeBase = code.replace(/\./g, '');
  if (codeBase.length < 7) {
    // Check if any chapter/section codes in S/T range need 7th char
    if (/^[ST]/.test(codeBase)) {
      return {
        id: 'seventh_char',
        name: '7th Character',
        passed: false,
        severity: 'warning',
        message: 'Injury/poisoning codes (Chapter 19) typically require a 7th character',
        suggestedFix: 'A=initial encounter, D=subsequent encounter, S=sequela',
      };
    }
  }

  return { id: 'seventh_char', name: '7th Character', passed: true, severity: 'info', message: 'No 7th character required' };
}

// ============================================================================
// Check 4: X PLACEHOLDER
// ============================================================================

function checkXPlaceholder(code: string, detail: ICD10CMDetail | undefined): CompletenessCheck {
  const codeBase = code.replace(/\./g, '');

  // X placeholder is needed when code has fewer than 6 characters but needs 7th char
  if (codeBase.includes('X') && codeBase.length === 7) {
    // Has X placeholder — verify it's used correctly
    const xPositions = [];
    for (let i = 0; i < codeBase.length; i++) {
      if (codeBase[i] === 'X' && i >= 3 && i < 6) xPositions.push(i);
    }

    if (xPositions.length > 0) {
      return {
        id: 'x_placeholder',
        name: 'X Placeholder',
        passed: true,
        severity: 'info',
        message: `X placeholder correctly used at position(s) ${xPositions.map(p => p + 1).join(', ')}`,
      };
    }
  }

  // Check if code needs X placeholder but doesn't have it
  if (detail?.sevenChrDef && Object.keys(detail.sevenChrDef).length > 0 && codeBase.length < 7) {
    const baseLen = codeBase.length;
    if (baseLen < 6) {
      return {
        id: 'x_placeholder',
        name: 'X Placeholder',
        passed: false,
        severity: 'error',
        message: `Code needs X placeholder(s) to reach 7 characters`,
        details: `Current length: ${baseLen} characters. Need ${6 - baseLen} X placeholder(s) before the 7th character.`,
        suggestedFix: `Add ${'X'.repeat(6 - baseLen)} before the 7th character extension`,
      };
    }
  }

  return { id: 'x_placeholder', name: 'X Placeholder', passed: true, severity: 'info', message: 'No X placeholder needed' };
}

// ============================================================================
// Check 5: EXCLUDES1 (Mutually Exclusive)
// ============================================================================

function checkExcludes1(
  code: string,
  detail: ICD10CMDetail | undefined,
  allAssignedCodes: string[],
  allDetails: Record<string, ICD10CMDetail>
): CompletenessCheck {
  if (!detail || detail.excludes1.length === 0) {
    return { id: 'excludes1', name: 'Excludes1', passed: true, severity: 'info', message: 'No Excludes1 restrictions' };
  }

  // Check if any assigned code conflicts with Excludes1
  const conflicts: string[] = [];
  for (const otherCode of allAssignedCodes) {
    if (otherCode === code) continue;

    for (const excl of detail.excludes1) {
      // Excludes1 entries can be descriptions or code references
      const exclCode = extractCodeFromNote(excl);
      if (exclCode && otherCode.startsWith(exclCode)) {
        conflicts.push(`${otherCode} conflicts with Excludes1 note: "${excl}"`);
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      id: 'excludes1',
      name: 'Excludes1',
      passed: false,
      severity: 'error',
      message: `CONFLICT: ${conflicts.length} Excludes1 violation(s) found`,
      details: conflicts.join('\n'),
      suggestedFix: 'These codes are mutually exclusive — they CANNOT be reported together. Remove one.',
    };
  }

  return {
    id: 'excludes1',
    name: 'Excludes1',
    passed: true,
    severity: 'info',
    message: 'No Excludes1 conflicts with assigned codes',
    details: `Has ${detail.excludes1.length} Excludes1 note(s) — none conflict with current assignments`,
  };
}

// ============================================================================
// Check 6: EXCLUDES2 (Not Included Here)
// ============================================================================

function checkExcludes2(
  code: string,
  detail: ICD10CMDetail | undefined,
  allAssignedCodes: string[],
  allDetails: Record<string, ICD10CMDetail>
): CompletenessCheck {
  if (!detail || detail.excludes2.length === 0) {
    return { id: 'excludes2', name: 'Excludes2', passed: true, severity: 'info', message: 'No Excludes2 notes' };
  }

  // Excludes2 means "not included here, but may be used together if documented"
  const potentialAdditions: string[] = [];
  for (const excl of detail.excludes2) {
    const exclCode = extractCodeFromNote(excl);
    if (exclCode) {
      const alreadyAssigned = allAssignedCodes.some((c) => c.startsWith(exclCode));
      if (!alreadyAssigned) {
        potentialAdditions.push(`Consider adding ${exclCode}: ${excl}`);
      }
    }
  }

  if (potentialAdditions.length > 0) {
    return {
      id: 'excludes2',
      name: 'Excludes2',
      passed: true, // Excludes2 is advisory, not a failure
      severity: 'info',
      message: `${potentialAdditions.length} additional code(s) may apply (Excludes2)`,
      details: potentialAdditions.slice(0, 5).join('\n'),
    };
  }

  return { id: 'excludes2', name: 'Excludes2', passed: true, severity: 'info', message: 'Excludes2 reviewed — no additional codes needed' };
}

// ============================================================================
// Check 7: CODE FIRST / USE ADDITIONAL CODE
// ============================================================================

function checkCodeFirst(
  code: string,
  detail: ICD10CMDetail | undefined,
  allAssignedCodes: string[]
): CompletenessCheck {
  if (!detail) {
    return { id: 'code_first', name: 'Code First / Use Additional', passed: true, severity: 'info', message: 'No sequencing requirements' };
  }

  const issues: string[] = [];

  // Code First: This code should NOT be sequenced first
  if (detail.codeFirst) {
    const requiredCode = extractCodeFromNote(detail.codeFirst);
    if (requiredCode) {
      const hasRequired = allAssignedCodes.some((c) => c.startsWith(requiredCode));
      if (!hasRequired) {
        issues.push(`CODE FIRST: Must code ${requiredCode} before ${code}. Note: ${detail.codeFirst}`);
      }
    } else {
      issues.push(`CODE FIRST note: ${detail.codeFirst}`);
    }
  }

  // Use Additional Code: This code requires an additional code after it
  if (detail.useAdditionalCode) {
    const additionalCode = extractCodeFromNote(detail.useAdditionalCode);
    if (additionalCode) {
      const hasAdditional = allAssignedCodes.some((c) => c.startsWith(additionalCode));
      if (!hasAdditional) {
        issues.push(`USE ADDITIONAL CODE: ${code} requires additional code ${additionalCode}. Note: ${detail.useAdditionalCode}`);
      }
    } else {
      issues.push(`USE ADDITIONAL CODE note: ${detail.useAdditionalCode}`);
    }
  }

  if (issues.length > 0) {
    return {
      id: 'code_first',
      name: 'Code First / Use Additional',
      passed: false,
      severity: 'warning',
      message: `Sequencing requirement(s) found`,
      details: issues.join('\n'),
      suggestedFix: 'Review the etiology/manifestation pairing and ensure correct code sequencing',
    };
  }

  return { id: 'code_first', name: 'Code First / Use Additional', passed: true, severity: 'info', message: 'No sequencing requirements' };
}

// ============================================================================
// Check 8: COMBINATION CODE
// ============================================================================

function checkCombinationCode(
  code: string,
  detail: ICD10CMDetail | undefined,
  allAssignedCodes: string[],
  allDetails: Record<string, ICD10CMDetail>,
  documentText: string
): CompletenessCheck {
  if (!detail) {
    return { id: 'combination', name: 'Combination Code', passed: true, severity: 'info', message: 'No combination code check needed' };
  }

  // Look for Code Also notes, which often indicate combination codes
  if (detail.codeAlso) {
    return {
      id: 'combination',
      name: 'Combination Code',
      passed: true,
      severity: 'info',
      message: 'Code Also note present — verify if a combination code exists',
      details: `Note: ${detail.codeAlso}. Check if both conditions can be captured by a single more specific code.`,
    };
  }

  // Check common combination patterns
  // E.g., Diabetes with complications (E11.x) captures both diabetes and the manifestation
  const descLower = detail.desc.toLowerCase();
  if (descLower.includes(' with ') || descLower.includes(' in ') || descLower.includes(' due to ')) {
    return {
      id: 'combination',
      name: 'Combination Code',
      passed: true,
      severity: 'info',
      message: 'This appears to be a combination code capturing multiple conditions',
      details: `"${detail.desc}" combines conditions — verify both aspects are documented`,
    };
  }

  return { id: 'combination', name: 'Combination Code', passed: true, severity: 'info', message: 'No combination code concerns' };
}

// ============================================================================
// Cross-Validation (Phase C — After All Codes Assigned)
// ============================================================================

export function runCrossValidation(
  assignedCodes: string[],
  allDetails: Record<string, ICD10CMDetail>,
  documentText: string,
  principalDxCode: string | null
): CrossValidationResult {
  const excludes1Conflicts: { code1: string; code2: string; message: string }[] = [];
  const missingSequencing: { code: string; requiresCode: string; type: 'code_first' | 'use_additional' }[] = [];
  const warnings: string[] = [];

  // Check Excludes1 between ALL pairs of assigned codes
  for (let i = 0; i < assignedCodes.length; i++) {
    for (let j = i + 1; j < assignedCodes.length; j++) {
      const code1 = assignedCodes[i];
      const code2 = assignedCodes[j];
      const detail1 = allDetails[code1];
      const detail2 = allDetails[code2];

      if (detail1?.excludes1) {
        for (const excl of detail1.excludes1) {
          const exclCode = extractCodeFromNote(excl);
          if (exclCode && code2.startsWith(exclCode)) {
            excludes1Conflicts.push({
              code1,
              code2,
              message: `${code1} Excludes1: "${excl}" — conflicts with ${code2}`,
            });
          }
        }
      }

      if (detail2?.excludes1) {
        for (const excl of detail2.excludes1) {
          const exclCode = extractCodeFromNote(excl);
          if (exclCode && code1.startsWith(exclCode)) {
            excludes1Conflicts.push({
              code1: code2,
              code2: code1,
              message: `${code2} Excludes1: "${excl}" — conflicts with ${code1}`,
            });
          }
        }
      }
    }
  }

  // Check Code First / Use Additional Code sequencing
  for (const code of assignedCodes) {
    const detail = allDetails[code];
    if (!detail) continue;

    if (detail.codeFirst) {
      const reqCode = extractCodeFromNote(detail.codeFirst);
      if (reqCode && !assignedCodes.some((c) => c.startsWith(reqCode))) {
        missingSequencing.push({ code, requiresCode: reqCode, type: 'code_first' });
      }
    }

    if (detail.useAdditionalCode) {
      const reqCode = extractCodeFromNote(detail.useAdditionalCode);
      if (reqCode && !assignedCodes.some((c) => c.startsWith(reqCode))) {
        missingSequencing.push({ code, requiresCode: reqCode, type: 'use_additional' });
      }
    }
  }

  // Check for missing external cause codes (injuries, poisonings)
  const textLower = documentText.toLowerCase();
  const hasInjury = assignedCodes.some((c) => /^[ST]/.test(c));
  const hasExternalCause = assignedCodes.some((c) => /^[VWX]/.test(c) || /^Y/.test(c));
  const missingExternalCause = hasInjury && !hasExternalCause;

  if (missingExternalCause) {
    warnings.push('Injury codes assigned but no external cause code (V00-Y99). Consider adding an external cause code to describe the mechanism of injury.');
  }

  // Verify principal diagnosis appropriateness
  let principalDxAppropriate = true;
  let principalDxIssue: string | undefined;

  if (principalDxCode) {
    const pdxDetail = allDetails[principalDxCode];
    if (pdxDetail) {
      // Principal diagnosis should not have "Code First" note (it would be a manifestation)
      if (pdxDetail.codeFirst) {
        principalDxAppropriate = false;
        principalDxIssue = `${principalDxCode} has a "Code First" note, suggesting it's a manifestation code. The etiology should be sequenced first per UHDDS guidelines.`;
      }

      // Principal diagnosis should be billable
      if (!pdxDetail.billable) {
        principalDxAppropriate = false;
        principalDxIssue = `${principalDxCode} is not a billable code (category level). Select a more specific child code for the principal diagnosis.`;
      }
    }
  }

  return {
    excludes1Conflicts,
    missingSequencing,
    missingExternalCause,
    principalDxAppropriate,
    principalDxIssue,
    warnings,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract an ICD-10 code reference from a note string.
 * Notes often contain patterns like "(E11.-)" or "code from category J44"
 */
function extractCodeFromNote(note: string): string | null {
  // Match patterns like: E11.-, J44, S72.0, T36-T50, etc.
  const patterns = [
    /\b([A-Z]\d{2}(?:\.\d{1,4})?)/,              // Standard code: E11.21, J44, S72.001
    /\(([A-Z]\d{2}(?:\.\d{0,4})?[\-]?)\)/,        // In parens: (E11.-), (J44)
    /code (?:from )?(?:category )?([A-Z]\d{2})/i,  // "code from category J44"
    /([A-Z]\d{2})\.\-/,                            // Wildcard: E11.-
  ];

  for (const pattern of patterns) {
    const match = note.match(pattern);
    if (match) {
      return match[1].replace(/[\.\-]+$/, ''); // Clean trailing dots/dashes
    }
  }
  return null;
}
