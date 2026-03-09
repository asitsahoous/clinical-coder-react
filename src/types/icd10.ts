// ============================================================================
// ICD-10 Code Types
// ============================================================================

export type Taxonomy = 'ICD-10-CM' | 'ICD-10-PCS';
export type Laterality = 'left' | 'right' | 'bilateral' | null;
export type EncounterType = 'initial' | 'subsequent' | 'sequela' | null;
export type Severity = 'mild' | 'moderate' | 'severe' | null;
export type Acuity = 'acute' | 'chronic' | 'subacute' | null;
export type POAIndicator = 'Y' | 'N' | 'U' | 'W' | 'EXEMPT';

// Lightweight index entry for search (all 151K codes)
export interface ICD10IndexEntry {
  code: string;
  desc: string;
  chapter?: number;
  section?: string;
  billable: boolean;
  taxonomy: Taxonomy;
  // PCS-specific fields
  pcsSection?: string;
  bodySystem?: string;
  operation?: string;
}

// Rich detail entry (used for validation and display)
export interface ICD10CMDetail {
  code: string;
  desc: string;
  chapter: number;
  chapterDesc: string;
  section: string;
  sectionDesc: string;
  billable: boolean;
  parent: string | null;
  children: string[];
  includes: string[];
  excludes1: string[];
  excludes2: string[];
  codeFirst: string | null;
  useAdditionalCode: string | null;
  codeAlso: string | null;
  sevenChrDef?: Record<string, string>;
}

// PCS table structure for code browser
export interface PCSTableEntry {
  section: { code: string; desc: string };
  bodySystem: { code: string; desc: string };
  operation: { code: string; desc: string; definition?: string };
  rows: PCSRow[];
}

export interface PCSRow {
  bodyParts: { code: string; desc: string }[];
  approaches: { code: string; desc: string }[];
  devices: { code: string; desc: string }[];
  qualifiers: { code: string; desc: string }[];
}

// Rich metadata from SQL (curated codes)
export interface ICD10RichMetadata {
  code: string;
  description: string;
  taxonomy: Taxonomy;
  isBillable: boolean;
  chapterNumber?: number;
  chapterName?: string;
  conditionCategory?: string;
  anatomicalSite?: string;
  laterality: Laterality;
  bodySystem?: string;
  encounterType: EncounterType;
  isFracture: boolean;
  isNeoplasm: boolean;
  isDrugEvent: boolean;
  isInfection: boolean;
  isPregnancyRelated: boolean;
  isDiabetes: boolean;
  isExternalCause: boolean;
  requiresLaterality: boolean;
  requires7thChar: boolean;
  valid7thChars?: string[];
  minAge?: number;
  maxAge?: number;
  validGenders?: string[];
  excludes1Codes?: string[];
  excludes2Codes?: string[];
  codeFirstNote?: string;
  useAdditionalCodeNote?: string;
  isPOAExempt: boolean;
  isPrincipalDxEligible: boolean;
  isMCC: boolean;
  isCC: boolean;
  severity: Severity;
  acuity: Acuity;
  // PCS fields
  pcsSection?: string;
  pcsSectionDesc?: string;
  pcsBodySystem?: string;
  pcsBodySystemDesc?: string;
  pcsRootOperation?: string;
  pcsRootOperationDesc?: string;
  pcsBodyPart?: string;
  pcsBodyPartDesc?: string;
  pcsApproach?: string;
  pcsApproachDesc?: string;
  pcsDevice?: string;
  pcsDeviceDesc?: string;
  pcsQualifier?: string;
  pcsQualifierDesc?: string;
}

// ============================================================================
// Coding Session Types
// ============================================================================

export type ConfidenceTier = 1 | 2 | 3 | 4;

export interface CodingResult {
  code: string;
  description: string;
  taxonomy: Taxonomy;
  confidence: number;
  tier: ConfidenceTier;
  source: 'keyword' | 'ai' | 'hybrid';
  matchedTerms: string[];
  reasoning?: string;
  redFlags: RedFlag[];
  poaIndicator?: POAIndicator;
  isPrincipalDx: boolean;
  sequenceOrder: number;
  validationResults: ValidationResult[];
  // CMS 2-Step Methodology fields
  codingReasoning?: CodingReasoning;
  completenessResult?: CompletenessResult;
  // Document context
  extractedCondition?: ExtractedCondition;
}

export interface RedFlag {
  type: 'missing_laterality' | 'missing_7th_char' | 'excludes1_conflict' | 'excludes2_warning' | 'additional_code_needed' | 'code_first_needed' | 'age_mismatch' | 'gender_mismatch' | 'not_billable';
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestedAction?: string;
}

export interface ValidationResult {
  rule: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface CodingSession {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  patientInfo?: PatientInfo;
  dischargeSummary: string;
  results: CodingResult[];
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNotes?: string;
  overallConfidence: number;
  overallTier: ConfidenceTier;
}

export interface PatientInfo {
  age?: number;
  gender?: 'M' | 'F';
  admissionDate?: string;
  dischargeDate?: string;
  encounterType?: 'inpatient' | 'outpatient' | 'emergency';
}

// ============================================================================
// Audit Types
// ============================================================================

export interface AuditRecord {
  id: string;
  sessionId: string;
  auditorId: string;
  timestamp: Date;
  originalCodes: CodingResult[];
  modifiedCodes: CodingResult[];
  addedCodes: string[];
  removedCodes: string[];
  changedCodes: { code: string; field: string; from: string; to: string }[];
  notes: string;
  status: 'pending' | 'completed';
  discrepancyRate: number;
}

// ============================================================================
// Dashboard Types
// ============================================================================

export interface DashboardMetrics {
  totalSessions: number;
  autoApproved: number;
  pendingReview: number;
  averageConfidence: number;
  tierDistribution: Record<ConfidenceTier, number>;
  topCodes: { code: string; desc: string; count: number }[];
  redFlagRate: number;
  codingAccuracy: number;
}

// ============================================================================
// CMS 2-Step Methodology Types
// ============================================================================

/**
 * Step 1: Alphabetic Index lookup path
 * Records the trail from clinical term → Index entry
 */
export interface IndexLookupStep {
  clinicalTerm: string;           // The term found in the document
  mainTerm: string;               // The ICD-10 main term (e.g., "Fracture")
  subTerms: string[];             // Sub-term path (e.g., ["femur", "neck", "displaced"])
  indexedCode: string;            // The code found in the Index
  indexNote?: string;             // Any note from the Index (e.g., "see also")
}

/**
 * Step 2: Tabular List verification result
 * Records verification of the code in the hierarchical list
 */
export interface TabularVerificationStep {
  verifiedCode: string;           // The final verified code
  categoryCode: string;           // Parent category (e.g., S62)
  sectionRange: string;           // Section range (e.g., "S60-S69")
  chapterNumber: number;          // Chapter number
  instructionalNotes: string[];   // Notes found at category/section/chapter level
  moreSpecificExists: boolean;    // Whether a more specific code exists
  selectedOverAlternative?: {     // Why this code was chosen over another
    alternativeCode: string;
    reason: string;
  };
}

/**
 * Result of CMS completeness checks (8 checks from CMS Job Aid)
 */
export interface CompletenessResult {
  checks: CompletenessCheck[];
  allPassed: boolean;
  passedCount: number;
  totalChecks: number;
}

export interface CompletenessCheck {
  id: 'billable' | 'laterality' | 'seventh_char' | 'x_placeholder' | 'excludes1' | 'excludes2' | 'code_first' | 'combination';
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: string;
  suggestedFix?: string;
}

/**
 * Full coding reasoning trail for a single code
 */
export interface CodingReasoning {
  // Step 0: Document context
  documentContext: string;         // What condition was identified and where

  // Step 1: Index lookup
  indexLookup: IndexLookupStep;

  // Step 2: Tabular verification
  tabularVerification: TabularVerificationStep;

  // Step 3: Completeness
  completeness: CompletenessResult;

  // Summary
  whyThisCode: string;            // Human-readable explanation
  codingPath: string;             // e.g., "Fracture → femur → neck → displaced → right → initial → S72.001A"
  alternativesConsidered: { code: string; reason: string }[];
}

/**
 * Holistic document structure extracted in Phase A
 */
export interface DocumentStructure {
  // Patient demographics
  patientAge?: number;
  patientGender?: 'M' | 'F';
  admissionDate?: string;
  dischargeDate?: string;
  encounterContext: 'inpatient' | 'outpatient' | 'emergency' | 'unknown';

  // Diagnoses extracted from document structure
  principalDiagnosis: ExtractedCondition | null;
  secondaryDiagnoses: ExtractedCondition[];

  // Procedures extracted from document structure
  procedures: ExtractedProcedure[];

  // Additional clinical context
  medications: string[];
  labResults: string[];
  hospitalCourse: string;

  // Raw sections
  sections: { heading: string; content: string }[];
}

export interface ExtractedCondition {
  rawText: string;                // Original text from the document
  normalizedTerm: string;         // Cleaned clinical term
  isAcute: boolean;
  isChronicExacerbation: boolean;
  bodyPart?: string;
  laterality?: 'left' | 'right' | 'bilateral';
  severity?: string;
  encounterType?: 'initial' | 'subsequent' | 'sequela';
  sectionFound: string;          // Which section this was found in
}

export interface ExtractedProcedure {
  rawText: string;
  normalizedTerm: string;
  approach?: string;
  device?: string;
  bodyPart?: string;
  laterality?: 'left' | 'right' | 'bilateral';
  sectionFound: string;
}

/**
 * Cross-validation result (Phase C checks)
 */
export interface CrossValidationResult {
  excludes1Conflicts: { code1: string; code2: string; message: string }[];
  missingSequencing: { code: string; requiresCode: string; type: 'code_first' | 'use_additional' }[];
  missingExternalCause: boolean;
  principalDxAppropriate: boolean;
  principalDxIssue?: string;
  warnings: string[];
}

// ============================================================================
// Code Tree Types (Click-A-Dex Style)
// ============================================================================

export interface CodeTreeNode {
  code: string;
  desc: string;
  billable: boolean;
  level: 'chapter' | 'section' | 'category' | 'subcategory' | 'code';
  children: string[];             // Child codes
  parent: string | null;
  hasMoreSpecific: boolean;       // RED FLAG: more specific codes exist
  // Metadata shown at each level
  includes?: string[];
  excludes1?: string[];
  excludes2?: string[];
  codeFirst?: string | null;
  useAdditionalCode?: string | null;
  codeAlso?: string | null;
  sevenChrDef?: Record<string, string>;
}

// ============================================================================
// App State Types
// ============================================================================

export type Persona = 'coder' | 'auditor';
export type ThemeMode = 'light' | 'dark';
export type AnalysisMode = 'keyword' | 'ai' | 'hybrid';

// ============================================================================
// Multi-Code-System Types (HCPCS, CPT, CDT, NDC)
// ============================================================================

export type CodeSystem = 'ICD-10-CM' | 'ICD-10-PCS' | 'HCPCS' | 'CPT' | 'CDT' | 'NDC';

/** HCPCS Level II Code (supplies, equipment, drugs, non-physician services) */
export interface HCPCSCode {
  code: string;               // 5-char alpha-numeric (A0000-V9999)
  desc: string;               // Long description
  shortDesc: string;          // Short description (28 chars)
  category: string;           // Category group (e.g., "Drugs Administered Other Than Oral Method")
  pricing: string | null;     // Pricing indicator code
  coverage: string | null;    // Coverage code (C/D/I/M/S)
  ascGroup: string | null;    // ASC Payment Group
  betos: string | null;       // BETOS code (clinical type)
  tos: string | null;         // Type of Service code
  effectiveDate: string | null;
  terminationDate: string | null;
  actionCode: string | null;  // A/B/C/D/F/N/P/R/S/T
  note: string | null;        // Processing note text
}

/** HCPCS Modifier */
export interface HCPCSModifier {
  code: string;               // 2-char alpha-numeric
  desc: string;               // Long description
  shortDesc: string;
  note: string | null;
}

/** HCPCS category summary for Code Browser navigation */
export interface HCPCSCategory {
  letter: string;             // First letter (A, B, C, etc.)
  name: string;               // Category name
  count: number;              // Number of codes
  codeRange: string;          // e.g., "A0000-A9999"
}

// ============================================================================
// Case & Document Model (Epic 2)
// ============================================================================

export type CaseStatus = 'intake' | 'coding' | 'review' | 'auditing' | 'complete';
export type DocumentType = 'discharge_summary' | 'op_note' | 'progress_note' | 'lab_report' | 'radiology' | 'pathology' | 'consult' | 'other';

/** A clinical case containing documents, code decisions, and audit trail */
export interface ClinicalCase {
  id: string;
  caseNumber: string;
  patientInfo: PatientInfo;
  documents: ClinicalDocument[];
  codeDecisions: CodeDecision[];
  auditDecisions: AuditDecision[];
  systemSuggestions: CodeCandidate[];      // Phase B output
  documentStructure: DocumentStructure | null;
  crossValidation: CrossValidationResult | null;
  drgSummary: DRGCaseSummary | null;
  hccValidation: HCCValidationResult | null;
  status: CaseStatus;
  assignedCoder?: string;
  assignedAuditor?: string;
  encounterType: 'inpatient' | 'outpatient' | 'emergency';
  claimSubmittedCodes?: string[];          // For DRG delta comparison
  createdAt: string;
  updatedAt: string;
}

/** A document attached to a clinical case */
export interface ClinicalDocument {
  id: string;
  caseId: string;
  fileName: string;
  mimeType: string;
  rawText: string;
  uploadedAt: string;
  classification: DocumentClassification;
  sections: DocumentSection[];
  entities: ExtractedEntity[];
}

/** Document classification result */
export interface DocumentClassification {
  documentType: DocumentType;
  confidence: number;
  setting: 'inpatient' | 'outpatient' | 'emergency' | 'unknown';
  domain: string;             // e.g., "cardiology", "orthopedics"
}

// ============================================================================
// Sectionizer & Evidence Spans (Epic 3)
// ============================================================================

export type SectionType = 'demographics' | 'diagnoses' | 'procedures' | 'medications' | 'labs' | 'hpi' | 'assessment' | 'hospital_course' | 'operative' | 'other';

/** A detected section within a document */
export interface DocumentSection {
  id: string;
  documentId: string;
  heading: string;
  normalizedHeading: string;
  startOffset: number;
  endOffset: number;
  content: string;
  sectionType: SectionType;
}

/** An evidence span linking a suggestion to specific document text */
export interface EvidenceSpan {
  id: string;
  documentId: string;
  sectionId: string;
  startOffset: number;
  endOffset: number;
  text: string;
  spanType: 'diagnosis' | 'procedure' | 'medication' | 'lab_value' | 'clinical_finding' | 'negation' | 'temporal';
  entityId?: string;
  candidateId?: string;
}

// ============================================================================
// Clinical NER & Assertions (Epic 4)
// ============================================================================

export type EntityType = 'condition' | 'procedure' | 'medication' | 'lab' | 'imaging' | 'device' | 'anatomy';

/** An extracted clinical entity from a document */
export interface ExtractedEntity {
  id: string;
  documentId: string;
  sectionId: string;
  rawText: string;
  normalizedTerm: string;
  entityType: EntityType;
  assertion: EntityAssertion;
  evidenceSpan: EvidenceSpan;
  codeCandidate?: CodeCandidate;
}

/** Assertion attributes for an extracted entity */
export interface EntityAssertion {
  negated: boolean;           // "ruled out", "no evidence of"
  uncertain: boolean;         // "possible", "likely", "suspected"
  historical: boolean;        // "history of", "PMH"
  familyHistory: boolean;     // "family history of"
  poaCandidate: POAIndicator;
  temporality: 'current' | 'past' | 'chronic' | 'acute_on_chronic';
  experiencer: 'patient' | 'family';
}

// ============================================================================
// Code Candidate (AI suggestion before coder decision)
// ============================================================================

/** A code suggestion from the system before coder review */
export interface CodeCandidate {
  id: string;
  caseId: string;
  code: string;
  codeSystem: CodeSystem;
  description: string;
  confidence: number;
  tier: ConfidenceTier;
  isPrincipalDx: boolean;
  sequenceOrder: number;
  evidenceSpans: EvidenceSpan[];
  codingReasoning?: CodingReasoning;
  completenessResult?: CompletenessResult;
  matchedTerms: string[];
  redFlags: RedFlag[];
  source: 'keyword' | 'ai' | 'hybrid';
  // DRG/HCC relevance
  ccLevel?: 'none' | 'CC' | 'MCC';
  hccCategory?: string;
  hccWeight?: number;
}

// ============================================================================
// Coder Workflow Types (Epic 7)
// ============================================================================

export type CoderAction = 'accept' | 'reject' | 'modify' | 'add_new';
export type ReasonCode = 'more_specific' | 'clinical_judgment' | 'documentation_supports' | 'coding_guideline' | 'duplicate' | 'not_documented' | 'other';

/** A coder's decision on a code candidate */
export interface CodeDecision {
  id: string;
  caseId: string;
  candidateId?: string;             // null if coder added a new code
  systemSuggestedCode?: string;     // What the system suggested
  systemConfidence?: number;
  coderAction: CoderAction;
  coderFinalCode: string;
  coderFinalCodeSystem: CodeSystem;
  coderFinalDescription: string;
  coderReason?: string;             // Free-text reason (required for reject/modify)
  reasonCode?: ReasonCode;
  isPrincipalDx: boolean;
  sequenceOrder: number;
  decidedAt: string;
  isAligned: boolean;               // Computed: systemSuggested === coderFinal
}

// ============================================================================
// Auditor Workflow Types (Epic 8)
// ============================================================================

export type AuditorAction = 'approve' | 'reject' | 'modify' | 'auto_approved';

/** An auditor's decision on a code decision */
export interface AuditDecision {
  id: string;
  caseId: string;
  codeDecisionId: string;
  auditorAction: AuditorAction;
  auditorFinalCode?: string;
  auditorNotes?: string;
  auditedAt: string;
  autoApprovalReason?: string;      // e.g., "System and coder aligned at 95% confidence"
}

/** Timestamped audit log entry */
export interface AuditLogEntry {
  id: string;
  caseId: string;
  timestamp: string;
  actor: 'system' | 'coder' | 'auditor';
  action: string;
  codeAffected?: string;
  details: string;
}

// ============================================================================
// DRG Validation Types (Epic 5)
// ============================================================================

/** DRG Case Summary for validation workflow */
export interface DRGCaseSummary {
  principalDxCandidates: RankedDiagnosis[];
  secondaryDxWithCCMCC: CCMCCClassification[];
  pcsCandidates: PCSCandidate[];
  highValueSignals: DRGSignal[];
  estimatedDRGRange?: string;       // Placeholder for future grouper
}

/** A ranked principal diagnosis candidate */
export interface RankedDiagnosis {
  code: string;
  description: string;
  rank: number;
  reasoning: string;
  evidenceSpans: EvidenceSpan[];
  isCurrentPrincipal: boolean;
}

/** CC/MCC classification for a secondary diagnosis */
export interface CCMCCClassification {
  code: string;
  description: string;
  ccLevel: 'none' | 'CC' | 'MCC';
  supported: boolean;
  evidence: string;
}

/** A PCS procedure candidate */
export interface PCSCandidate {
  code: string;
  description: string;
  confidence: number;
  evidence: string;
  bodyPart?: string;
  approach?: string;
}

/** A DRG validation signal */
export type DRGSignalType = 'pdx_mismatch' | 'missing_mcc' | 'missing_procedure' | 'upcoding_risk' | 'undercoding_risk' | 'cc_opportunity' | 'sequencing_issue';

export interface DRGSignal {
  type: DRGSignalType;
  message: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
  impactedCode?: string;
}

// ============================================================================
// HCC Validation Types (Epic 6)
// ============================================================================

export type HCCValidationStatus = 'supported' | 'unsupported' | 'suspect' | 'needs_specificity';
export type SupportLevel = 'high' | 'medium' | 'low';

/** Overall HCC validation result for a case */
export interface HCCValidationResult {
  diagnoses: HCCDiagnosisResult[];
  totalRiskScore: number;
  supportedCount: number;
  unsupportedCount: number;
  suspectCount: number;
  needsSpecificityCount: number;
}

/** HCC validation for a single diagnosis */
export interface HCCDiagnosisResult {
  code: string;
  description: string;
  hccCategory?: string;
  hccCategoryDesc?: string;
  riskWeight?: number;
  validationStatus: HCCValidationStatus;
  supportLevel: SupportLevel;
  evidencePack: EvidencePack;
  recommendations: string[];
}

/** Evidence pack grouping evidence by source for an HCC diagnosis */
export interface EvidencePack {
  assessmentPlanEvidence: EvidenceSpan[];
  dischargeDxEvidence: EvidenceSpan[];
  problemListEvidence: EvidenceSpan[];
  treatmentEvidence: EvidenceSpan[];
  labEvidence: EvidenceSpan[];
}

// ============================================================================
// Fraud Detection Types (Epic 9)
// ============================================================================

/** A synthetic claims record */
export interface ClaimRecord {
  claimId: string;
  providerId: string;
  providerSpecialty: string;
  memberIdHash: string;
  serviceDate: string;
  codes: string[];
  paidAmount: number;
  units: number;
  placeOfService: string;
  region?: string;
}

/** A provider profile built from claims analysis */
export interface ProviderProfile {
  providerId: string;
  providerName: string;
  specialty: string;
  totalClaims: number;
  totalPaid: number;
  utilizationRate: number;        // Claims per month
  avgCodesPerClaim: number;
  avgPaidPerClaim: number;
  topCodes: { code: string; count: number; percentOfClaims: number }[];
  riskScore: number;              // 0-100
  riskFlags: FraudFlag[];
  monthlyTrend: { month: string; claims: number; paid: number }[];
}

/** A fraud detection flag with evidence */
export type FraudFlagType = 'high_utilization' | 'upcoding' | 'unbundling' | 'temporal_spike' | 'peer_outlier' | 'impossible_day' | 'high_complexity_ratio';

export interface FraudFlag {
  type: FraudFlagType;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  evidence: {
    metric: string;
    providerValue: number;
    peerAvg: number;
    zScore: number;
  };
}

/** Peer baseline for comparison */
export interface PeerBaseline {
  specialty: string;
  avgClaimsPerMonth: number;
  avgPaidPerClaim: number;
  avgCodesPerClaim: number;
  avgComplexityRatio: number;
  stdClaimsPerMonth: number;
  stdPaidPerClaim: number;
  stdCodesPerClaim: number;
  stdComplexityRatio: number;
  providerCount: number;
}
