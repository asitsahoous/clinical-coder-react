/**
 * HCC Validation Engine — Classifies diagnoses as
 * supported/unsupported/suspect/needs_specificity with evidence packs.
 */

import type {
  HCCValidationResult, HCCDiagnosisResult, HCCValidationStatus,
  SupportLevel, EvidencePack, EvidenceSpan,
  CodeCandidate, DocumentStructure, DocumentSection, ICD10CMDetail
} from '@/types/icd10';

// ---- HCC Category Mappings (CMS-HCC V28 simplified) ----
// In production, this would be loaded from a complete CMS HCC mapping file.
// These are high-value HCC categories commonly flagged in audits.

interface HCCMapping {
  pattern: RegExp;
  hccCategory: string;
  hccDesc: string;
  riskWeight: number;
}

const HCC_MAPPINGS: HCCMapping[] = [
  // HCC 2: Septicemia/Shock
  { pattern: /^(A40|A41|R65\.2)/, hccCategory: 'HCC 2', hccDesc: 'Septicemia, Sepsis, Systemic Inflammatory Response Syndrome/Shock', riskWeight: 0.455 },
  // HCC 6: Opportunistic Infections
  { pattern: /^B20/, hccCategory: 'HCC 6', hccDesc: 'Opportunistic Infections', riskWeight: 0.439 },
  // HCC 8: Metastatic Cancer
  { pattern: /^C7[7-9]|^C80/, hccCategory: 'HCC 8', hccDesc: 'Metastatic Cancer and Acute Leukemia', riskWeight: 2.484 },
  // HCC 9: Lung/Upper Digestive/Other Severe Cancer
  { pattern: /^C3[34]|^C1[5-6]|^C25/, hccCategory: 'HCC 9', hccDesc: 'Lung and Other Severe Cancers', riskWeight: 1.024 },
  // HCC 10: Lymphoma and Other Cancers
  { pattern: /^C8[1-5]|^C90/, hccCategory: 'HCC 10', hccDesc: 'Lymphoma and Other Cancers', riskWeight: 0.675 },
  // HCC 11: Colorectal/Bladder/Other Cancers
  { pattern: /^C1[8-9]|^C20|^C67/, hccCategory: 'HCC 11', hccDesc: 'Colorectal, Bladder, and Other Cancers', riskWeight: 0.320 },
  // HCC 17: Diabetes with Acute Complications
  { pattern: /^E1[0-3]\.1/, hccCategory: 'HCC 17', hccDesc: 'Diabetes with Acute Complications', riskWeight: 0.368 },
  // HCC 18: Diabetes with Chronic Complications
  { pattern: /^E1[0-3]\.[2-5]/, hccCategory: 'HCC 18', hccDesc: 'Diabetes with Chronic Complications', riskWeight: 0.368 },
  // HCC 19: Diabetes without Complications
  { pattern: /^E1[0-3]\.9/, hccCategory: 'HCC 19', hccDesc: 'Diabetes without Complication', riskWeight: 0.120 },
  // HCC 35: End-Stage Liver Disease
  { pattern: /^K72|^K74\.6/, hccCategory: 'HCC 35', hccDesc: 'End-Stage Liver Disease', riskWeight: 1.203 },
  // HCC 40: ESRD
  { pattern: /^N18\.6/, hccCategory: 'HCC 40', hccDesc: 'End-Stage Renal Disease', riskWeight: 0.329 },
  // HCC 85: Congestive Heart Failure
  { pattern: /^I50/, hccCategory: 'HCC 85', hccDesc: 'Congestive Heart Failure', riskWeight: 0.368 },
  // HCC 86: Acute MI
  { pattern: /^I21|^I22/, hccCategory: 'HCC 86', hccDesc: 'Acute Myocardial Infarction', riskWeight: 0.291 },
  // HCC 96: Specified Heart Arrhythmias
  { pattern: /^I48/, hccCategory: 'HCC 96', hccDesc: 'Specified Heart Arrhythmias', riskWeight: 0.294 },
  // HCC 111: COPD
  { pattern: /^J44/, hccCategory: 'HCC 111', hccDesc: 'Chronic Obstructive Pulmonary Disease', riskWeight: 0.346 },
  // HCC 112: Fibrosis of Lung
  { pattern: /^J84/, hccCategory: 'HCC 112', hccDesc: 'Fibrosis of Lung and Other Chronic Lung Disorders', riskWeight: 0.291 },
  // HCC 115: Aspiration/Bacterial Pneumonia
  { pattern: /^J15|^J69/, hccCategory: 'HCC 115', hccDesc: 'Aspiration and Specified Bacterial Pneumonias', riskWeight: 0.190 },
  // HCC 130: Dialysis Status
  { pattern: /^Z99\.2/, hccCategory: 'HCC 130', hccDesc: 'Dialysis Status', riskWeight: 0.464 },
  // HCC 134: Stroke
  { pattern: /^I63/, hccCategory: 'HCC 134', hccDesc: 'Ischemic or Unspecified Stroke', riskWeight: 0.291 },
  // HCC 135: CKD Stage 4
  { pattern: /^N18\.4/, hccCategory: 'HCC 135', hccDesc: 'Chronic Kidney Disease, Stage 4', riskWeight: 0.291 },
  // HCC 136: CKD Stage 5
  { pattern: /^N18\.5/, hccCategory: 'HCC 136', hccDesc: 'Chronic Kidney Disease, Stage 5', riskWeight: 0.291 },
  // HCC 137: CKD Stage 3
  { pattern: /^N18\.3/, hccCategory: 'HCC 137', hccDesc: 'Chronic Kidney Disease, Stage 3', riskWeight: 0.069 },
  // HCC 161: Major Depression
  { pattern: /^F32|^F33/, hccCategory: 'HCC 161', hccDesc: 'Major Depressive and Bipolar Disorders', riskWeight: 0.387 },
];

/**
 * Find HCC mapping for a code
 */
function findHCCMapping(code: string): HCCMapping | null {
  for (const mapping of HCC_MAPPINGS) {
    if (mapping.pattern.test(code)) return mapping;
  }
  return null;
}

/**
 * Build evidence pack for a diagnosis from document sections
 */
function buildEvidencePack(
  code: string,
  candidate: CodeCandidate,
  sections: DocumentSection[]
): EvidencePack {
  const pack: EvidencePack = {
    assessmentPlanEvidence: [],
    dischargeDxEvidence: [],
    problemListEvidence: [],
    treatmentEvidence: [],
    labEvidence: [],
  };

  // Use evidence spans from the candidate
  for (const span of (candidate.evidenceSpans || [])) {
    const section = sections.find(s => s.id === span.sectionId);
    if (!section) {
      // Default to discharge dx evidence
      pack.dischargeDxEvidence.push(span);
      continue;
    }

    switch (section.sectionType) {
      case 'assessment':
        pack.assessmentPlanEvidence.push(span);
        break;
      case 'diagnoses':
        pack.dischargeDxEvidence.push(span);
        break;
      case 'medications':
        pack.treatmentEvidence.push(span);
        break;
      case 'labs':
        pack.labEvidence.push(span);
        break;
      default:
        // Check heading for more context
        if (/problem\s+list/i.test(section.heading)) {
          pack.problemListEvidence.push(span);
        } else if (/treatment|medication|therapy/i.test(section.heading)) {
          pack.treatmentEvidence.push(span);
        } else {
          pack.dischargeDxEvidence.push(span);
        }
    }
  }

  // If no evidence spans, create synthetic ones from matched terms
  if (candidate.evidenceSpans.length === 0 && candidate.matchedTerms.length > 0) {
    pack.dischargeDxEvidence.push({
      id: `synth-${code}`,
      documentId: '',
      sectionId: '',
      startOffset: 0,
      endOffset: 0,
      text: candidate.matchedTerms.join(', '),
      spanType: 'diagnosis',
    });
  }

  return pack;
}

/**
 * Score the support level for a diagnosis based on its evidence pack
 */
function scoreSupport(pack: EvidencePack): { score: number; level: SupportLevel } {
  let score = 0;

  // Assessment/Plan evidence is strongest (weight: 3)
  if (pack.assessmentPlanEvidence.length > 0) score += 3;

  // Treatment evidence confirms diagnosis (weight: 2.5)
  if (pack.treatmentEvidence.length > 0) score += 2.5;

  // Discharge Dx evidence (weight: 2)
  if (pack.dischargeDxEvidence.length > 0) score += 2;

  // Lab evidence supports (weight: 1.5)
  if (pack.labEvidence.length > 0) score += 1.5;

  // Problem list alone is weakest (weight: 1)
  if (pack.problemListEvidence.length > 0) score += 1;

  // Normalize to 0-1
  const normalizedScore = Math.min(score / 8, 1);

  let level: SupportLevel;
  if (normalizedScore >= 0.6) level = 'high';
  else if (normalizedScore >= 0.3) level = 'medium';
  else level = 'low';

  return { score: normalizedScore, level };
}

/**
 * Determine validation status for a diagnosis
 */
function determineStatus(
  code: string,
  candidate: CodeCandidate,
  supportScore: number,
  cmDetail?: ICD10CMDetail
): HCCValidationStatus {
  // Check if code needs more specificity
  if (cmDetail && !cmDetail.billable && cmDetail.children.length > 0) {
    return 'needs_specificity';
  }

  // Check completeness issues
  if (candidate.completenessResult && !candidate.completenessResult.allPassed) {
    const failedChecks = candidate.completenessResult.checks.filter(c => !c.passed);
    const hasCriticalFailure = failedChecks.some(c => c.severity === 'error');
    if (hasCriticalFailure) return 'needs_specificity';
  }

  // Score-based classification
  if (supportScore >= 0.6) return 'supported';
  if (supportScore >= 0.3) return 'suspect';
  return 'unsupported';
}

/**
 * Generate recommendations for a diagnosis
 */
function generateRecommendations(
  status: HCCValidationStatus,
  code: string,
  candidate: CodeCandidate,
  hccMapping: HCCMapping | null,
  cmDetail?: ICD10CMDetail
): string[] {
  const recs: string[] = [];

  if (status === 'needs_specificity') {
    if (cmDetail && cmDetail.children.length > 0) {
      recs.push(`Code ${code} has ${cmDetail.children.length} more specific child codes available. Review documentation for specificity.`);
    }
    if (candidate.completenessResult) {
      const failed = candidate.completenessResult.checks.filter(c => !c.passed);
      for (const check of failed) {
        if (check.suggestedFix) recs.push(check.suggestedFix);
      }
    }
  }

  if (status === 'unsupported') {
    recs.push('Documentation does not adequately support this diagnosis. Query provider for additional documentation.');
    if (hccMapping) {
      recs.push(`This is an HCC diagnosis (${hccMapping.hccCategory}) with risk weight ${hccMapping.riskWeight}. Ensure documentation supports clinical validity.`);
    }
  }

  if (status === 'suspect') {
    recs.push('Evidence is limited. Review for additional supporting documentation (assessment, treatment notes, lab results).');
  }

  if (hccMapping && status === 'supported') {
    recs.push(`Validated HCC ${hccMapping.hccCategory} (weight: ${hccMapping.riskWeight}). Documentation supports this diagnosis.`);
  }

  return recs;
}

/**
 * Validate all diagnoses for HCC compliance
 */
export function validateHCCDiagnoses(
  candidates: CodeCandidate[],
  documentStructure: DocumentStructure | null,
  cmDetails: Record<string, ICD10CMDetail>
): HCCValidationResult {
  const diagnoses: HCCDiagnosisResult[] = [];
  let totalRiskScore = 0;
  let supportedCount = 0;
  let unsupportedCount = 0;
  let suspectCount = 0;
  let needsSpecificityCount = 0;

  const sections = documentStructure?.sections.map((s, i) => ({
    id: `sec-${i}`,
    documentId: '',
    heading: s.heading,
    normalizedHeading: s.heading.toLowerCase(),
    startOffset: 0,
    endOffset: 0,
    content: s.content,
    sectionType: 'other' as const,
  })) || [];

  const dxCandidates = candidates.filter(c => c.codeSystem === 'ICD-10-CM');

  for (const candidate of dxCandidates) {
    const hccMapping = findHCCMapping(candidate.code);
    const cmDetail = cmDetails[candidate.code];

    // Build evidence pack
    const evidencePack = buildEvidencePack(candidate.code, candidate, sections);

    // Score support
    const { score, level } = scoreSupport(evidencePack);

    // Determine status
    const status = determineStatus(candidate.code, candidate, score, cmDetail);

    // Generate recommendations
    const recommendations = generateRecommendations(status, candidate.code, candidate, hccMapping, cmDetail);

    diagnoses.push({
      code: candidate.code,
      description: candidate.description,
      hccCategory: hccMapping?.hccCategory,
      hccCategoryDesc: hccMapping?.hccDesc,
      riskWeight: hccMapping?.riskWeight,
      validationStatus: status,
      supportLevel: level,
      evidencePack,
      recommendations,
    });

    // Accumulate stats
    if (hccMapping && status === 'supported') {
      totalRiskScore += hccMapping.riskWeight;
    }
    switch (status) {
      case 'supported': supportedCount++; break;
      case 'unsupported': unsupportedCount++; break;
      case 'suspect': suspectCount++; break;
      case 'needs_specificity': needsSpecificityCount++; break;
    }
  }

  return {
    diagnoses,
    totalRiskScore: Math.round(totalRiskScore * 1000) / 1000,
    supportedCount,
    unsupportedCount,
    suspectCount,
    needsSpecificityCount,
  };
}
