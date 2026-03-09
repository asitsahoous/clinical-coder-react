# Clinical Coding Platform v3.0 — Comprehensive Enhancement Plan

## Executive Summary

Extend the clinical coding platform from an ICD-10-only code assignment tool into a **full clinical coding intelligence platform** supporting:
- **6 Code Systems**: ICD-10-CM, ICD-10-PCS, HCPCS Level II (loaded), CPT (placeholder), CDT (placeholder), NDC (placeholder)
- **DRG Validation Engine**: Principal Dx ranking, CC/MCC tagging, PCS procedure matching
- **HCC/Diagnosis Validation**: Supported/Unsupported/Suspect/Needs-Specificity classification with evidence
- **Fraud Pattern Detection**: Provider-level outlier scoring with explanation strings
- **Enhanced Coder Workflow**: Document upload → NER extraction → code suggestion → accept/reject/edit → submit
- **Enhanced Auditor Workflow**: Bulk auto-approve aligned codes → review only deltas → per-code sign-off → audit trail
- **Evidence-Based Coding**: Every suggestion traceable to document spans with character offsets

---

## PART 1: INITIAL PLAN (9 Epics)

### EPIC 1 — Code System Foundation
**Goal**: Multi-code-set database with versioning and CodeCandidate layer.

**What exists**: ICD-10-CM (46,881 codes) + ICD-10-PCS (79,193 codes) loaded from JSON.

**What to build**:
1. **HCPCS Parser Script** (`scripts/parse-hcpcs.ts`): Parse the 320-char fixed-width `HCPC2026_JAN_ANWEB_01122026.txt` into `hcpcs-index.json`
   - Handle record types 3/4/7/8 (multi-line concatenation)
   - Extract: code, longDesc, shortDesc, pricingIndicator, coverageCode, ASCGroup, BETOS, typeOfService, processingNoteNum, effectiveDate, terminationDate, actionCode
   - Parse `proc_notes_JAN2026.txt` → map note numbers to text
   - Output: ~7,000 unique HCPCS Level II codes (alpha-numeric starting A-V)
   - Exclude CPT codes (numeric 00000-99999) from display due to AMA copyright

2. **New Types** in `icd10.ts` (rename to `code-types.ts`):
   ```
   HCPCSCode { code, longDesc, shortDesc, pricingIndicator, coverageCode, ascGroup, betos, typeOfService, effectiveDate, terminationDate, processingNotes }
   CodeSystem = 'ICD-10-CM' | 'ICD-10-PCS' | 'HCPCS' | 'CPT' | 'CDT' | 'NDC'
   CodeCandidate { code, codeSystem, description, confidence, tier, evidenceSpans[], reasoning, completenessResult }
   ```

3. **Extend code-database-store.ts**: Add `hcpcsIndex: HCPCSCode[]`, `hcpcsNotes: Record<number, string>`, `searchHCPCS()` method

4. **Code Browser Enhancement**: Add HCPCS tab alongside ICD-10-CM/PCS with search + category browse (A-codes, B-codes, etc.)

### EPIC 2 — Case & Document Model
**Goal**: Standardize case objects and document ingestion.

**What exists**: CodingSession with dischargeSummary (text paste), PatientInfo.

**What to build**:
1. **Enhanced Case Model**:
   ```
   ClinicalCase {
     id, caseNumber, patientInfo, payerInfo?,
     documents: ClinicalDocument[],
     codeDecisions: CodeDecision[],
     auditDecisions: AuditDecision[],
     status: 'intake' | 'coding' | 'review' | 'auditing' | 'complete',
     assignedCoder?, assignedAuditor?,
     createdAt, updatedAt,
     encounterType: 'inpatient' | 'outpatient' | 'emergency',
     claimSubmittedCodes?: string[]  // For DRG delta comparison
   }
   ```

2. **Document Model**:
   ```
   ClinicalDocument {
     id, caseId, fileName, mimeType, rawText, uploadedAt,
     classification: DocumentClassification,
     sections: DocumentSection[],
     entities: ExtractedEntity[],
     evidenceSpans: EvidenceSpan[]
   }
   ```

3. **Document Upload UI**: File drop zone supporting .txt, .pdf (text extraction), with document type classification

4. **Document Classifier v1**: Rules-based using section headers + keywords → assigns class (discharge_summary | op_note | progress_note | lab_report | radiology | pathology | consult)

### EPIC 3 — Sectionizer & Evidence Spans
**Goal**: Every AI suggestion traceable to specific document text.

**What exists**: `extractSections()` in keyword-engine.ts returns `{heading, content}[]`

**What to build**:
1. **Enhanced Section Detection**:
   ```
   DocumentSection {
     id, documentId, heading, normalizedHeading,
     startOffset, endOffset, content,
     sectionType: 'demographics' | 'diagnoses' | 'procedures' | 'medications' | 'labs' | 'hpi' | 'assessment' | 'hospital_course' | 'other'
   }
   ```

2. **Evidence Span Model**:
   ```
   EvidenceSpan {
     id, documentId, sectionId,
     startOffset, endOffset,
     text, textHash,
     entityId?,       // Links to extracted entity
     candidateId?,    // Links to code candidate
     spanType: 'diagnosis' | 'procedure' | 'medication' | 'lab_value' | 'clinical_finding'
   }
   ```

3. **UI Enhancement**: Highlight evidence spans in document viewer when hovering over code suggestions. Click a code → document scrolls to and highlights the evidence text.

### EPIC 4 — Clinical NER & Assertions
**Goal**: Extract clinical entities with negation/temporality awareness.

**What exists**: `CLINICAL_TERM_INDEX` with ~40 regex patterns + `parseDocumentHolistically()`.

**What to build**:
1. **ExtractedEntity Model**:
   ```
   ExtractedEntity {
     id, documentId, sectionId,
     rawText, normalizedTerm,
     entityType: 'condition' | 'procedure' | 'medication' | 'lab' | 'imaging' | 'device',
     assertion: EntityAssertion,
     evidenceSpan: EvidenceSpan,
     codeCandidate?: CodeCandidate  // Linked suggested code
   }
   ```

2. **EntityAssertion**:
   ```
   EntityAssertion {
     negated: boolean,          // "ruled out", "no evidence of"
     uncertain: boolean,        // "possible", "likely", "suspected"
     historical: boolean,       // "history of", "PMH"
     familyHistory: boolean,    // "family history of"
     poaCandidate: POAIndicator,
     temporality: 'current' | 'past' | 'chronic' | 'acute_on_chronic',
     experiencer: 'patient' | 'family'
   }
   ```

3. **Assertion Detection Rules**:
   - Negation cues: "no evidence of", "ruled out", "negative for", "without", "denies"
   - History cues: "history of", "PMH", "past medical history", "h/o"
   - Uncertainty cues: "possible", "probable", "likely", "suspected", "cannot rule out"
   - Temporal cues: "acute", "chronic", "acute on chronic", "new onset", "longstanding"

4. **AI-Enhanced NER** (optional, using OpenAI key from settings):
   - Send document sections to GPT-4o-mini for entity extraction
   - Merge AI entities with rules-based entities
   - Score confidence higher when both agree

### EPIC 5 — DRG Validation Engine
**Goal**: Principal Dx ranking, CC/MCC detection, PCS matching, risk delta.

**What to build**:
1. **CC/MCC Reference Data** (`src/data/cc-mcc-list.json`):
   - Build from ICD10CMDetail metadata (isMCC, isCC flags already exist in ICD10RichMetadata)
   - Static list of CC (Complication/Comorbidity) and MCC (Major CC) codes
   - ~8,700 CC codes + ~3,200 MCC codes

2. **DRG Case Summary Service** (`src/engines/drg-engine.ts`):
   ```
   DRGCaseSummary {
     principalDxCandidates: RankedDiagnosis[],  // Top 3-5 with reasoning
     secondaryDxWithCCMCC: CCMCCClassification[],
     pcsCandidates: PCSCandidate[],
     highValueSignals: DRGSignal[],
     estimatedDRGRange?: string  // Placeholder for future grouper
   }

   RankedDiagnosis { code, description, rank, reasoning, evidenceSpans[], isCurrentPrincipal }
   CCMCCClassification { code, description, ccLevel: 'none' | 'CC' | 'MCC', supported: boolean, evidence }
   DRGSignal { type: 'pdx_mismatch' | 'missing_mcc' | 'missing_procedure' | 'upcoding_risk' | 'undercoding_risk', message, severity, evidence }
   ```

3. **Delta View** (`src/components/drg/DRGDeltaPanel.tsx`):
   - Side-by-side: Claim-submitted codes vs AI-extracted codes
   - Color-coded: Green=match, Yellow=different specificity, Red=missing/added
   - Signal badges: "Missing MCC", "PDx Mismatch", "Procedure not coded"

4. **DRG Validation Page** (`src/pages/DRGValidationPage.tsx`):
   - Upload encounter → run extraction → show DRG analysis
   - Principal Dx ranking with justification
   - CC/MCC impact analysis
   - PCS procedure verification

### EPIC 6 — HCC/Diagnosis Validation
**Goal**: Classify each diagnosis as supported/unsupported/suspect/needs-specificity.

**What to build**:
1. **HCC Mapping Data** (`src/data/hcc-mappings.json`):
   - Placeholder with known high-value HCC categories
   - Map ICD-10-CM codes → HCC categories with risk weights
   - Version-tagged for CMS-HCC V28 model

2. **HCC Validation Engine** (`src/engines/hcc-engine.ts`):
   ```
   HCCValidationResult {
     diagnoses: HCCDiagnosisResult[],
     totalRiskScore: number,
     supportedCount, unsupportedCount, suspectCount, needsSpecificityCount
   }

   HCCDiagnosisResult {
     code, description,
     hccCategory?: string,
     riskWeight?: number,
     validationStatus: 'supported' | 'unsupported' | 'suspect' | 'needs_specificity',
     supportLevel: 'high' | 'medium' | 'low',
     evidencePack: EvidencePack,
     recommendations: string[]
   }

   EvidencePack {
     assessmentPlanEvidence: EvidenceSpan[],   // Highest weight
     dischargeDxEvidence: EvidenceSpan[],      // Medium weight
     problemListEvidence: EvidenceSpan[],      // Low weight
     treatmentEvidence: EvidenceSpan[],        // Confirms dx
     labEvidence: EvidenceSpan[]              // Supports/contradicts
   }
   ```

3. **Support Scoring Rules**:
   - **Supported** (score ≥ 0.8): Found in Assessment/Plan + treatment evidence + lab confirmation
   - **Suspect** (score 0.5-0.8): Found in dx list but limited supporting evidence
   - **Needs Specificity** (score varies): Non-billable code, laterality missing, 7th char needed
   - **Unsupported** (score < 0.5): Only in problem list with no current evidence, or negated

4. **HCC Dashboard Panel** (`src/components/hcc/HCCPanel.tsx`):
   - Risk score summary
   - Per-diagnosis evidence cards with support level indicators
   - "Needs Specificity" actionable items

### EPIC 7 — Enhanced Coder Workflow
**Goal**: Full accept/edit/reject flow with decision tracking.

**What exists**: CodingWorkspacePage with text paste → analyze → view results. No per-code decisions.

**What to build**:
1. **CodeDecision Model**:
   ```
   CodeDecision {
     id, caseId, candidateId?,
     systemSuggestedCode?: string,
     systemConfidence?: number,
     coderAction: 'accept' | 'reject' | 'modify' | 'add_new',
     coderFinalCode: string,
     coderFinalCodeSystem: CodeSystem,
     coderReason?: string,       // Required when rejecting/modifying
     reasonCode?: 'more_specific' | 'clinical_judgment' | 'documentation_supports' | 'coding_guideline' | 'other',
     isPrincipalDx: boolean,
     sequenceOrder: number,
     decidedAt: Date,
     isAligned: boolean          // Computed: systemSuggested === coderFinal
   }
   ```

2. **Enhanced Coding UI** (`CodingWorkspacePage.tsx` rewrite):
   - **Left**: Document viewer with section tabs + evidence highlights
   - **Right Top**: System suggestions with Accept/Reject/Modify buttons per code
   - **Right Bottom**: Coder's final code set (drag to reorder, add manual codes)
   - **Per-code actions**:
     - ✅ Accept (one-click, keeps system code)
     - ✏️ Modify (opens code search, must provide reason)
     - ❌ Reject (must provide reason)
     - ➕ Add New (manual code entry not suggested by system)
   - **Submit for Review** button → changes case status to 'review'

3. **Evidence Viewer Panel**: Click evidence span → highlights in document. Click code → shows linked evidence.

### EPIC 8 — Enhanced Auditor Workflow
**Goal**: Bulk auto-approve aligned codes, focus review on deltas.

**What exists**: AuditPage with approve/reject per session. No per-code granularity.

**What to build**:
1. **AuditDecision Model**:
   ```
   AuditDecision {
     id, caseId, codeDecisionId,
     auditorAction: 'approve' | 'reject' | 'modify' | 'auto_approved',
     auditorFinalCode?: string,
     auditorNotes?: string,
     auditedAt: Date,
     autoApprovalReason?: string   // "System and coder aligned at 95% confidence"
   }
   ```

2. **Auto-Approve Rules**:
   - `isAligned === true` AND `systemConfidence >= 0.80` → auto-approve
   - `isAligned === true` AND `systemConfidence >= 0.50` → auto-approve with flag
   - `isAligned === false` → requires manual review
   - `coderAction === 'add_new'` → requires manual review

3. **Enhanced Audit UI** (`AuditPage.tsx` rewrite):
   - **Case Queue**: Filter by status (pending_audit | in_audit | complete)
   - **Case View**:
     - **Auto-Approved Section** (collapsed by default): Green badges, "X codes auto-approved"
     - **Requires Review Section** (expanded): Yellow/Red delta cards showing:
       - System suggestion vs Coder decision (side-by-side)
       - Coder's reason for override
       - Evidence spans for both
       - Auditor action buttons: Approve Coder / Revert to System / Enter Different Code
     - **Audit Summary**: Total codes, auto-approved count, reviewed count, changes count
   - **Bulk Actions**: "Approve All Remaining" / "Sign Off Case"
   - **Audit Trail**: Timestamped log of every action taken

4. **Audit Log** (`src/components/audit/AuditTrail.tsx`):
   ```
   AuditLogEntry {
     timestamp, actor: 'system' | 'coder' | 'auditor',
     action, codeAffected, details, caseId
   }
   ```

### EPIC 9 — Fraud Pattern Detection
**Goal**: Provider-level outlier scoring with explanation.

**What to build**:
1. **Claims Data Model** (synthetic for demo):
   ```
   ClaimRecord {
     claimId, providerId, providerSpecialty, memberIdHash,
     serviceDate, codes: string[], paidAmount, units,
     placeOfService, region?
   }

   ProviderProfile {
     providerId, specialty, totalClaims, totalPaid,
     utilizationRate, avgCodesPerClaim, avgPaidPerClaim,
     topCodes: {code, count, percentOfClaims}[],
     riskScore: number, riskFlags: FraudFlag[]
   }

   FraudFlag {
     type: 'high_utilization' | 'upcoding' | 'unbundling' | 'temporal_spike' | 'peer_outlier' | 'impossible_day',
     severity: 'low' | 'medium' | 'high',
     explanation: string,
     evidence: { metric, providerValue, peerAvg, zScore }
   }
   ```

2. **Fraud Detection Engine** (`src/engines/fraud-engine.ts`):
   - Feature computation per provider:
     - Claims per month (utilization rate)
     - Average paid per claim
     - Average codes per encounter
     - High-complexity code ratio (MCC codes / total)
     - Weekend/holiday service rate
   - Peer comparison: Z-score against same specialty
   - Temporal anomaly: Month-over-month spike detection
   - Outlier flagging with explanation strings

3. **Synthetic Claims Generator** (`src/data/synthetic-claims.ts`):
   - Generate 50 providers, 5,000 claims
   - Inject 3-5 outlier providers with known fraud patterns
   - Used for demo and testing

4. **Fraud Dashboard** (`src/pages/FraudDashboardPage.tsx`):
   - Provider risk list (sortable by risk score)
   - Drilldown: claims timeline, code frequency, peer comparison charts
   - Flag explanations with evidence

---

## PART 2: CRITICAL ANALYSIS

### Risk 1: Bundle Size & Performance
**Current**: 727KB JS bundle + 45MB data files (loaded async)
**Adding**: HCPCS (~2MB JSON) + CC/MCC list (~500KB) + HCC mappings (~300KB) + synthetic claims (~200KB) + new engines (~100KB)
**Risk**: Total data approaching 50MB. Initial load time could be 5-10s.
**Mitigation**:
- Lazy-load HCPCS and fraud data only when those pages are accessed
- Use code splitting (`React.lazy()`) for DRG, HCC, and Fraud pages
- Compress JSON files with gzip (Vite handles this in production)
- Consider IndexedDB for large datasets instead of keeping everything in memory

### Risk 2: localStorage Limits
**Current**: Sessions + audit records stored in localStorage (~5-10MB limit)
**Adding**: ClinicalCase objects with documents, entities, evidence spans, code decisions, audit decisions
**Risk**: A single case with a long document + 20 entities + 30 evidence spans + 15 code decisions could be 50-100KB. 50 cases = 5MB, hitting the limit.
**Mitigation**:
- Use IndexedDB (via `idb` library) for case data instead of localStorage
- Keep only lightweight app settings in localStorage (persona, theme, API keys)
- Implement case archiving (complete cases get compressed/removed from active store)

### Risk 3: CPT Copyright
**The AMA holds copyright on CPT codes**. We cannot display CPT code numbers + descriptions.
**Mitigation**:
- HCPCS Level II file contains CPT codes (numeric 00000-99999) but we MUST NOT display their descriptions
- Filter out numeric-only codes from HCPCS display
- Add "CPT codes require AMA license" placeholder in UI
- Focus on HCPCS Level II alpha-numeric codes (A0000-V9999) which are CMS-maintained and public

### Risk 4: No Backend
**This is a frontend-only React app**. All processing happens in the browser.
**Risk**: NER, fraud detection, and AI calls are compute-intensive. Large documents may cause UI freezes.
**Mitigation**:
- Use Web Workers for heavy computation (NER, fraud scoring)
- Chunk document processing with `requestIdleCallback`
- AI calls (OpenAI) are already async and non-blocking
- Keep fraud analysis simple (Z-score based, not ML)

### Risk 5: Evidence Span Accuracy
**Character offsets are fragile**. Any text preprocessing (trimming, normalization) can shift offsets.
**Mitigation**:
- Store raw document text separately, never modify it
- Compute offsets against the raw text
- Use text hash verification for spans
- Show context (±50 chars) around evidence spans in UI

### Risk 6: Demo Scope vs Reality
**This is a leadership demo**, not a production system. Over-engineering database schemas for a frontend-only app could waste effort.
**Mitigation**:
- Use TypeScript interfaces as the "schema" — no actual database tables
- Store everything in Zustand + IndexedDB
- Focus on impressive UI/UX over data architecture purity
- Make fraud data synthetic and hardcoded, not dynamically computed

### Risk 7: NER Without a Model
**Rules-based NER has limited accuracy**. Clinical text is highly variable.
**Mitigation**:
- Current CLINICAL_TERM_INDEX covers ~100+ patterns, which is good for demo
- Add assertion detection (negation, history) to reduce false positives significantly
- Use AI augmentation via OpenAI when API key is available (hybrid mode)
- For demo: use curated sample documents that work well with the rules engine

---

## PART 3: ADJUSTED PLAN (Post-Critical Analysis)

### Key Adjustments:

1. **Storage: IndexedDB instead of localStorage** for case data
   - Add `idb` dependency (tiny, 1KB)
   - Create `case-store.ts` using IndexedDB for ClinicalCase objects
   - Keep `app-store.ts` (localStorage) for settings only

2. **Code Splitting**: Lazy-load new pages
   - DRGValidationPage, FraudDashboardPage loaded on demand
   - HCPCS data loaded only when Code Browser or outpatient coding accessed

3. **CPT Handling**: Exclude entirely from display
   - HCPCS parser filters out numeric CPT codes
   - UI shows "CPT codes not available (AMA license required)" placeholder

4. **Fraud Module**: Synthetic-first approach
   - Pre-generate synthetic claims data at build time
   - No real-time computation needed for demo
   - Focus on visualization and drilldown

5. **NER Enhancement**: Pragmatic approach
   - Extend existing rules engine (add 50+ more patterns + assertion detection)
   - AI augmentation as optional enhancement (when API key present)
   - Not building a full NER pipeline — that's out of scope for a demo

6. **Epic Priority Reordering**:
   - Phase 1 (Foundation): Epic 1 + Epic 2 + Epic 3 (code system + case model + evidence spans)
   - Phase 2 (Core Workflows): Epic 7 + Epic 8 (coder + auditor enhanced workflows)
   - Phase 3 (Validation): Epic 4 + Epic 5 + Epic 6 (NER + DRG + HCC)
   - Phase 4 (Fraud): Epic 9 (fraud detection)

---

## PART 4: FINAL IMPLEMENTATION STEPS

### Phase 1: Foundation (Epics 1-3)

**Step 1.1: HCPCS Parser & Data** (NEW FILES)
- Create `scripts/parse-hcpcs.ts` — Node.js script to parse fixed-width HCPCS file
- Create `src/data/hcpcs-index.json` — Parsed HCPCS Level II codes
- Create `src/data/hcpcs-notes.json` — Processing notes
- Estimated: ~7,000 HCPCS Level II codes

**Step 1.2: Type System Overhaul** (MODIFY)
- Rename `src/types/icd10.ts` → keep file, expand significantly
- Add: HCPCSCode, CodeSystem, CodeCandidate, ClinicalCase, ClinicalDocument, DocumentClassification, DocumentSection, ExtractedEntity, EntityAssertion, EvidenceSpan, CodeDecision, AuditDecision, AuditLogEntry
- Add: DRGCaseSummary, CCMCCClassification, DRGSignal, HCCDiagnosisResult, HCCValidationResult, EvidencePack
- Add: ClaimRecord, ProviderProfile, FraudFlag
- Keep all existing types intact (backward compatible)

**Step 1.3: Storage Layer** (NEW + MODIFY)
- Add `idb` package dependency
- Create `src/stores/case-store.ts` — IndexedDB-backed store for ClinicalCase objects
- Extend `src/stores/code-database-store.ts` — Add HCPCS loading, search, lookup
- Modify `src/stores/app-store.ts` — Slim down to settings-only, delegate case data to case-store

**Step 1.4: Code Browser Enhancement** (MODIFY)
- Modify `src/pages/CodeBrowserPage.tsx` — Add HCPCS tab with search
- Modify `src/components/code-browser/CodeTree.tsx` — Support HCPCS category hierarchy (A-V code groups)

**Step 1.5: Document Model & Sectionizer** (NEW + MODIFY)
- Create `src/engines/document-classifier.ts` — Rules-based document type classification
- Create `src/engines/sectionizer.ts` — Enhanced section detection with character offsets
- Create `src/engines/evidence-tracker.ts` — Evidence span creation, linking, and verification

### Phase 2: Core Workflows (Epics 7-8)

**Step 2.1: Coder Workflow Rewrite** (MAJOR MODIFY)
- Rewrite `src/pages/CodingWorkspacePage.tsx`:
  - Add file upload zone (txt/pdf text extraction)
  - Split into: DocumentPanel (left) + SuggestionPanel (right-top) + FinalCodePanel (right-bottom)
  - Per-code Accept/Reject/Modify buttons
  - CodeDecision tracking for every action
  - Submit for Review action
- Create `src/components/coding/DocumentViewer.tsx` — Document display with section tabs + evidence highlights
- Create `src/components/coding/CodeSuggestionCard.tsx` — Individual suggestion with action buttons
- Create `src/components/coding/FinalCodeList.tsx` — Coder's final code set with reordering
- Create `src/components/coding/CodeSearchModal.tsx` — Modal to search and add codes manually

**Step 2.2: Auditor Workflow Rewrite** (MAJOR MODIFY)
- Rewrite `src/pages/AuditPage.tsx`:
  - Case queue with filters (pending_audit, in_audit, complete)
  - Auto-approved section (collapsed) with count badge
  - Review section (expanded) with delta cards
  - Per-code auditor actions: Approve / Revert / Modify
  - Bulk approve + sign-off
  - Audit trail timeline
- Create `src/components/audit/DeltaCard.tsx` — Side-by-side system vs coder display
- Create `src/components/audit/AuditTrail.tsx` — Timestamped action log
- Create `src/components/audit/AutoApproveSection.tsx` — Collapsed auto-approved codes

**Step 2.3: Auto-Approve Engine** (NEW)
- Create `src/engines/auto-approve.ts`:
  - Input: CodeDecision[] from coder
  - Rules: aligned + confidence >= 0.80 → auto-approve
  - Output: AuditDecision[] with auto_approved status
  - Edge cases: always require review for principal Dx, MCC codes, DRG-impacting codes

### Phase 3: Validation Engines (Epics 4-6)

**Step 3.1: Enhanced NER + Assertions** (NEW + MODIFY)
- Extend `src/engines/keyword-engine.ts`:
  - Add 50+ more clinical term patterns
  - Add assertion detection (negation, uncertainty, history, temporal)
  - Return ExtractedEntity[] with EntityAssertion
  - Link each entity to EvidenceSpan with offsets
- Create `src/engines/assertion-detector.ts` — Negation/uncertainty/history detection rules

**Step 3.2: DRG Validation Engine** (NEW)
- Create `src/data/cc-mcc-list.json` — CC/MCC code classification reference
- Create `src/engines/drg-engine.ts`:
  - `buildDRGCaseSummary(case)` → DRGCaseSummary
  - Principal Dx ranking logic (based on encounter type, severity, specificity)
  - CC/MCC tagging per secondary Dx
  - PCS candidate matching from op notes
  - Delta computation: AI vs claim-submitted
  - High-value signal generation
- Create `src/pages/DRGValidationPage.tsx` — DRG analysis view
- Create `src/components/drg/DRGDeltaPanel.tsx` — Side-by-side delta view
- Create `src/components/drg/CCMCCPanel.tsx` — CC/MCC classification display

**Step 3.3: HCC Validation Engine** (NEW)
- Create `src/data/hcc-mappings.json` — ICD-10-CM → HCC category mappings (placeholder + known high-value categories)
- Create `src/engines/hcc-engine.ts`:
  - `validateDiagnoses(entities, evidenceSpans)` → HCCValidationResult
  - Support scoring: Assessment/Plan (high) > Discharge Dx (medium) > Problem List (low)
  - Evidence pack construction per diagnosis
  - Specificity checker: is there a more specific code available?
- Create `src/components/hcc/HCCPanel.tsx` — Risk score + per-diagnosis evidence cards
- Create `src/components/hcc/EvidencePackView.tsx` — Evidence breakdown per diagnosis

### Phase 4: Fraud Detection (Epic 9)

**Step 4.1: Synthetic Claims Data** (NEW)
- Create `src/data/synthetic-claims.ts`:
  - Generator function: 50 providers, ~5,000 claims
  - 3-5 injected outlier providers with known patterns:
    - High-utilization provider (2x peer rate)
    - Upcoding provider (high MCC ratio)
    - Temporal spike provider (sudden volume increase)
    - Impossible-day provider (>24 hours of services)
  - Deterministic seed for reproducibility

**Step 4.2: Fraud Detection Engine** (NEW)
- Create `src/engines/fraud-engine.ts`:
  - `buildProviderProfiles(claims)` → ProviderProfile[]
  - `computePeerBaselines(providers, specialty)` → PeerBaseline
  - `detectAnomalies(provider, baseline)` → FraudFlag[]
  - `scoreProvider(flags)` → riskScore (0-100)
  - Features: utilization rate, avg paid, code complexity, temporal pattern, weekend ratio

**Step 4.3: Fraud Dashboard** (NEW)
- Create `src/pages/FraudDashboardPage.tsx`:
  - Provider risk list (sortable table)
  - Risk score distribution chart (recharts)
  - Provider drilldown: claims timeline, top codes, peer comparison
  - Flag details with evidence metrics
- Add route: `/fraud` → FraudDashboardPage

### Phase 5: Integration & Polish

**Step 5.1: Navigation Update** (MODIFY)
- Update `src/App.tsx` — Add routes: `/drg`, `/hcc`, `/fraud`
- Update `src/components/layout/Sidebar.tsx` — Add nav items with icons
- Update `src/components/layout/Header.tsx` — Update persona switcher (coder sees coding/browse/drg, auditor sees audit/fraud)

**Step 5.2: Dashboard Enhancement** (MODIFY)
- Update `src/pages/DashboardPage.tsx`:
  - Add code system stats (ICD-10-CM, ICD-10-PCS, HCPCS counts)
  - Add auto-approve rate metric
  - Add DRG validation stats
  - Add fraud alert summary
  - Add HCC risk score summary

**Step 5.3: Settings Enhancement** (MODIFY)
- Update `src/pages/SettingsPage.tsx`:
  - Add HCPCS data status
  - Add fraud detection toggle
  - Add auto-approve threshold slider (default 80%)
  - API key management already exists (keep as-is, users enter their own keys)

**Step 5.4: Sample Data & Fixtures** (NEW)
- Create `src/data/sample-cases.ts`:
  - 3-5 complete sample cases with pre-built:
    - Document text
    - Expected extractions
    - Expected code suggestions
    - Expected coder decisions
    - Expected audit outcomes
  - Used for demo and acceptance testing

---

## PART 5: FILE INVENTORY

### New Files (27 files)
```
scripts/parse-hcpcs.ts                          # HCPCS parser script
src/data/hcpcs-index.json                       # Parsed HCPCS codes
src/data/hcpcs-notes.json                       # Processing notes
src/data/cc-mcc-list.json                       # CC/MCC reference
src/data/hcc-mappings.json                      # HCC category mappings
src/data/synthetic-claims.ts                    # Synthetic fraud data
src/data/sample-cases.ts                        # Demo fixtures

src/stores/case-store.ts                        # IndexedDB case store

src/engines/document-classifier.ts              # Document type classifier
src/engines/sectionizer.ts                      # Enhanced section detection
src/engines/evidence-tracker.ts                 # Evidence span management
src/engines/assertion-detector.ts               # Negation/uncertainty detection
src/engines/auto-approve.ts                     # Auto-approve rules engine
src/engines/drg-engine.ts                       # DRG validation engine
src/engines/hcc-engine.ts                       # HCC validation engine
src/engines/fraud-engine.ts                     # Fraud detection engine

src/components/coding/DocumentViewer.tsx         # Document display + highlights
src/components/coding/CodeSuggestionCard.tsx     # Suggestion with actions
src/components/coding/FinalCodeList.tsx          # Coder's final code set
src/components/coding/CodeSearchModal.tsx        # Manual code search modal
src/components/audit/DeltaCard.tsx               # System vs coder delta
src/components/audit/AuditTrail.tsx              # Timestamped audit log
src/components/audit/AutoApproveSection.tsx      # Auto-approved codes section
src/components/drg/DRGDeltaPanel.tsx             # DRG delta view
src/components/drg/CCMCCPanel.tsx                # CC/MCC display
src/components/hcc/HCCPanel.tsx                  # HCC validation display
src/components/hcc/EvidencePackView.tsx          # Evidence breakdown

src/pages/DRGValidationPage.tsx                 # DRG analysis page
src/pages/FraudDashboardPage.tsx                # Fraud dashboard page
```

### Modified Files (10 files)
```
src/types/icd10.ts                              # Major type expansion
src/stores/app-store.ts                         # Slim to settings, add case-store integration
src/stores/code-database-store.ts               # Add HCPCS support
src/engines/keyword-engine.ts                   # Extended NER + assertions
src/pages/CodingWorkspacePage.tsx               # Major coder workflow rewrite
src/pages/AuditPage.tsx                         # Major auditor workflow rewrite
src/pages/CodeBrowserPage.tsx                   # Add HCPCS tab
src/pages/DashboardPage.tsx                     # Enhanced metrics
src/pages/SettingsPage.tsx                      # HCPCS status + settings
src/App.tsx                                     # New routes
src/components/layout/Sidebar.tsx               # New nav items
src/components/code-browser/CodeTree.tsx        # HCPCS categories
package.json                                    # Add idb dependency
```

---

## PART 6: ACCEPTANCE CRITERIA

### AC1: Code System Foundation
- [ ] HCPCS Level II codes load in Code Browser (search "J1234" returns descriptor)
- [ ] HCPCS search returns pricing/coverage fields where available
- [ ] CPT codes excluded from display with appropriate message

### AC2: Document Workflow
- [ ] Upload discharge summary → system classifies as "discharge_summary"
- [ ] Section detection identifies "Discharge Diagnoses", "Hospital Course", etc.
- [ ] Evidence spans link code suggestions to specific document text

### AC3: Coder Workflow
- [ ] System suggests codes with confidence tiers
- [ ] Coder can Accept (one click), Modify (with reason), Reject (with reason), Add New
- [ ] CodeDecision records track every action
- [ ] "Submit for Review" changes case status

### AC4: Auditor Workflow
- [ ] Auto-approve fires for aligned codes with confidence ≥ 80%
- [ ] Auditor sees only deltas (non-aligned codes) expanded
- [ ] Per-code approve/reject/modify actions
- [ ] Audit trail shows timestamped log of all actions

### AC5: DRG Validation
- [ ] Principal Dx candidates ranked with reasoning
- [ ] CC/MCC classification per secondary diagnosis
- [ ] Delta view shows AI vs claim-submitted differences
- [ ] High-value signals flagged (missing MCC, PDx mismatch)

### AC6: HCC Validation
- [ ] Each diagnosis classified: supported/unsupported/suspect/needs_specificity
- [ ] Evidence pack per diagnosis shows supporting documentation
- [ ] Specificity recommendations where more specific code available

### AC7: Fraud Detection
- [ ] Synthetic claims generate 50 providers with known outliers
- [ ] Provider risk scores computed via Z-score peer comparison
- [ ] Injected outlier providers flagged with explanation strings
- [ ] Dashboard shows risk list + drilldown

---

## PART 7: EXECUTION ORDER

Given the interdependencies, the recommended build order is:

```
Step 1.1  Parse HCPCS data → hcpcs-index.json
Step 1.2  Type system expansion (all new interfaces)
Step 1.3  IndexedDB case store + code-database-store HCPCS extension
Step 1.4  Code Browser HCPCS tab
Step 1.5  Document classifier + sectionizer + evidence tracker
    ↓
Step 2.1  Coder workflow rewrite (document upload + accept/reject/modify)
Step 2.2  Auditor workflow rewrite (auto-approve + delta review)
Step 2.3  Auto-approve engine
    ↓
Step 3.1  Enhanced NER + assertion detection
Step 3.2  DRG validation engine + page
Step 3.3  HCC validation engine + components
    ↓
Step 4.1  Synthetic claims data
Step 4.2  Fraud detection engine
Step 4.3  Fraud dashboard page
    ↓
Step 5.1  Navigation + routing updates
Step 5.2  Dashboard enhancement
Step 5.3  Settings enhancement
Step 5.4  Sample fixtures + acceptance testing
```

Total estimated new code: ~8,000-10,000 lines across 27 new files + 12 modified files.
