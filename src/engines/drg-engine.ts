/**
 * DRG Validation Engine — Principal Dx ranking, CC/MCC detection,
 * PCS procedure matching, and high-value signal generation.
 */

import type {
  DRGCaseSummary, RankedDiagnosis, CCMCCClassification,
  PCSCandidate, DRGSignal, DRGSignalType,
  CodeCandidate, DocumentStructure, EvidenceSpan,
  ICD10CMDetail
} from '@/types/icd10';

// ---- CC/MCC Reference Lists ----
// These are simplified reference sets based on CMS FY2026 CC/MCC definitions.
// A full production system would load the complete CC/MCC lists from CMS.

/** Common MCC (Major Complication/Comorbidity) code patterns */
const MCC_PATTERNS = [
  /^A40/, /^A41/,           // Sepsis
  /^I21/,                   // STEMI
  /^I46/,                   // Cardiac arrest
  /^I50\.2/, /^I50\.4/,    // Acute heart failure
  /^J96\.0/, /^J96\.2/,    // Respiratory failure
  /^N17/,                   // Acute kidney failure
  /^K72\.0/,               // Acute hepatic failure
  /^E08\.1/, /^E09\.1/, /^E10\.1/, /^E11\.1/, /^E13\.1/,  // DM with ketoacidosis
  /^G93\.4/,               // Encephalopathy
  /^R65\.2/,               // Severe sepsis
  /^T81\.1/,               // Shock during/after procedure
  /^J80/,                  // ARDS
  /^E87\.0/,               // Hyperosmolality
  /^K85/,                  // Acute pancreatitis
  /^I26/,                  // Pulmonary embolism
  /^G04/,                  // Encephalitis/myelitis
];

/** Common CC (Complication/Comorbidity) code patterns */
const CC_PATTERNS = [
  /^I50\.(?!2|4)/,         // CHF (non-acute)
  /^E11\.2/, /^E11\.3/, /^E11\.4/, /^E11\.5/,  // DM with complications
  /^I48/,                  // Atrial fibrillation
  /^J44/,                  // COPD
  /^N18\.3/, /^N18\.4/, /^N18\.5/,  // CKD stage 3-5
  /^J18/,                  // Pneumonia
  /^I10/,                  // Essential hypertension (in some contexts)
  /^E78/,                  // Hyperlipidemia
  /^I25/,                  // Chronic ischemic heart disease
  /^F17/,                  // Nicotine dependence
  /^Z87/,                  // Personal history
  /^G47\.3/,               // Sleep apnea
  /^I63/,                  // Cerebral infarction
  /^K21/,                  // GERD
  /^M54/,                  // Back pain
];

/**
 * Classify a code as none, CC, or MCC
 */
export function classifyCC_MCC(code: string): 'none' | 'CC' | 'MCC' {
  for (const pattern of MCC_PATTERNS) {
    if (pattern.test(code)) return 'MCC';
  }
  for (const pattern of CC_PATTERNS) {
    if (pattern.test(code)) return 'CC';
  }
  return 'none';
}

/**
 * Rank principal diagnosis candidates based on clinical guidelines
 */
function rankPrincipalDxCandidates(
  candidates: CodeCandidate[],
  documentStructure: DocumentStructure | null
): RankedDiagnosis[] {
  const ranked: RankedDiagnosis[] = [];
  const dxCandidates = candidates.filter(
    c => c.codeSystem === 'ICD-10-CM' || c.codeSystem === 'ICD-10-PCS'
  );

  for (const candidate of dxCandidates) {
    let rank = 0;
    const reasons: string[] = [];

    // Factor 1: Already flagged as principal Dx by engine
    if (candidate.isPrincipalDx) {
      rank += 50;
      reasons.push('Identified as principal diagnosis by coding engine');
    }

    // Factor 2: Found in principal diagnosis section
    if (documentStructure?.principalDiagnosis) {
      const pdxNorm = documentStructure.principalDiagnosis.normalizedTerm.toLowerCase();
      if (candidate.description.toLowerCase().includes(pdxNorm) ||
          pdxNorm.includes(candidate.description.toLowerCase().substring(0, 20))) {
        rank += 40;
        reasons.push('Matches documented principal diagnosis');
      }
    }

    // Factor 3: Higher confidence = better candidate
    rank += candidate.confidence * 20;
    reasons.push(`System confidence: ${Math.round(candidate.confidence * 100)}%`);

    // Factor 4: MCC codes are valuable as secondary, not typically principal
    const ccLevel = classifyCC_MCC(candidate.code);
    if (ccLevel === 'MCC' && !candidate.isPrincipalDx) {
      rank -= 10; // Slightly lower rank for MCC as principal
      reasons.push('MCC code — typically better as secondary diagnosis');
    }

    // Factor 5: Acute conditions rank higher than chronic for principal
    if (/acute|stemi|infarction|failure/i.test(candidate.description)) {
      rank += 15;
      reasons.push('Acute condition — higher principal Dx eligibility');
    }

    // Factor 6: Symptom codes rank lower (R-codes)
    if (candidate.code.startsWith('R')) {
      rank -= 20;
      reasons.push('Symptom code — should use definitive diagnosis if available');
    }

    ranked.push({
      code: candidate.code,
      description: candidate.description,
      rank,
      reasoning: reasons.join('; '),
      evidenceSpans: candidate.evidenceSpans || [],
      isCurrentPrincipal: candidate.isPrincipalDx,
    });
  }

  // Sort by rank descending
  ranked.sort((a, b) => b.rank - a.rank);

  // Assign sequential ranks
  ranked.forEach((r, i) => { r.rank = i + 1; });

  return ranked.slice(0, 5); // Top 5 candidates
}

/**
 * Classify secondary diagnoses for CC/MCC impact
 */
function classifySecondaryDx(
  candidates: CodeCandidate[],
  principalCode: string
): CCMCCClassification[] {
  return candidates
    .filter(c => c.code !== principalCode && (c.codeSystem === 'ICD-10-CM'))
    .map(c => ({
      code: c.code,
      description: c.description,
      ccLevel: classifyCC_MCC(c.code),
      supported: c.confidence >= 0.7,
      evidence: c.matchedTerms.join(', ') || 'Pattern match',
    }));
}

/**
 * Extract PCS procedure candidates
 */
function extractPCSCandidates(
  candidates: CodeCandidate[],
  documentStructure: DocumentStructure | null
): PCSCandidate[] {
  const pcsCandidates = candidates.filter(c => c.codeSystem === 'ICD-10-PCS');

  return pcsCandidates.map(c => ({
    code: c.code,
    description: c.description,
    confidence: c.confidence,
    evidence: c.matchedTerms.join(', ') || 'Procedure extraction',
    bodyPart: undefined,
    approach: undefined,
  }));
}

/**
 * Generate high-value review signals
 */
function generateSignals(
  principalCandidates: RankedDiagnosis[],
  secondaryClassified: CCMCCClassification[],
  pcsCandidates: PCSCandidate[],
  claimSubmittedCodes: string[] | undefined,
  documentStructure: DocumentStructure | null
): DRGSignal[] {
  const signals: DRGSignal[] = [];

  // Signal: Principal Dx mismatch with document
  if (principalCandidates.length > 1) {
    const top = principalCandidates[0];
    const second = principalCandidates[1];
    if (!top.isCurrentPrincipal && second.isCurrentPrincipal) {
      signals.push({
        type: 'pdx_mismatch',
        message: `Current principal Dx (${second.code}) may not be optimal. Consider ${top.code}: ${top.description}`,
        severity: 'high',
        evidence: top.reasoning,
        impactedCode: top.code,
      });
    }
  }

  // Signal: Missing MCC that is documented
  const mccCodes = secondaryClassified.filter(s => s.ccLevel === 'MCC');
  const unsupportedMCC = mccCodes.filter(m => !m.supported);
  if (unsupportedMCC.length > 0) {
    for (const mcc of unsupportedMCC) {
      signals.push({
        type: 'missing_mcc',
        message: `MCC code ${mcc.code} (${mcc.description}) has low documentation support`,
        severity: 'high',
        evidence: `Current evidence: ${mcc.evidence || 'Limited'}`,
        impactedCode: mcc.code,
      });
    }
  }

  // Signal: CC opportunity — documented conditions that could be CC
  const nonCC = secondaryClassified.filter(s => s.ccLevel === 'none' && s.supported);
  if (nonCC.length > 0 && mccCodes.length === 0) {
    signals.push({
      type: 'cc_opportunity',
      message: `No MCC codes assigned. Review secondary diagnoses for specificity that could qualify as CC/MCC.`,
      severity: 'medium',
      evidence: `${nonCC.length} supported diagnoses without CC/MCC classification`,
    });
  }

  // Signal: Missing procedure (op note present but no PCS codes)
  if (documentStructure && documentStructure.procedures.length > 0 && pcsCandidates.length === 0) {
    signals.push({
      type: 'missing_procedure',
      message: `${documentStructure.procedures.length} procedure(s) documented but no PCS codes assigned`,
      severity: 'high',
      evidence: documentStructure.procedures.map(p => p.rawText).join('; '),
    });
  }

  // Signal: Delta with claim-submitted codes
  if (claimSubmittedCodes && claimSubmittedCodes.length > 0) {
    const allCodes = new Set([
      ...principalCandidates.map(p => p.code),
      ...secondaryClassified.map(s => s.code),
    ]);
    const missingFromClaim = claimSubmittedCodes.filter(c => !allCodes.has(c));
    const extraInAI = [...allCodes].filter(c => !claimSubmittedCodes.includes(c));

    if (missingFromClaim.length > 0) {
      signals.push({
        type: 'undercoding_risk',
        message: `${missingFromClaim.length} claim code(s) not found in AI extraction: ${missingFromClaim.join(', ')}`,
        severity: 'medium',
        evidence: 'Codes on claim but not extracted from documentation',
      });
    }
    if (extraInAI.length > 0) {
      signals.push({
        type: 'upcoding_risk',
        message: `${extraInAI.length} AI-extracted code(s) not on claim: ${extraInAI.slice(0, 5).join(', ')}`,
        severity: 'low',
        evidence: 'Codes extracted but not on submitted claim — potential undercoding on claim',
      });
    }
  }

  return signals;
}

/**
 * Build a complete DRG Case Summary
 */
export function buildDRGCaseSummary(
  candidates: CodeCandidate[],
  documentStructure: DocumentStructure | null,
  claimSubmittedCodes?: string[]
): DRGCaseSummary {
  // Step 1: Rank principal Dx candidates
  const principalDxCandidates = rankPrincipalDxCandidates(candidates, documentStructure);

  // Step 2: Classify secondary diagnoses
  const principalCode = principalDxCandidates[0]?.code || '';
  const secondaryDxWithCCMCC = classifySecondaryDx(candidates, principalCode);

  // Step 3: Extract PCS candidates
  const pcsCandidates = extractPCSCandidates(candidates, documentStructure);

  // Step 4: Generate high-value signals
  const highValueSignals = generateSignals(
    principalDxCandidates, secondaryDxWithCCMCC, pcsCandidates,
    claimSubmittedCodes, documentStructure
  );

  return {
    principalDxCandidates,
    secondaryDxWithCCMCC,
    pcsCandidates,
    highValueSignals,
    estimatedDRGRange: undefined, // Placeholder for future MS-DRG grouper
  };
}
