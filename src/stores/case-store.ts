import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ClinicalCase, CaseStatus, CodeDecision, AuditDecision,
  AuditLogEntry, CodeCandidate, DocumentStructure, CrossValidationResult,
  DRGCaseSummary, HCCValidationResult
} from '@/types/icd10';

// ============================================================================
// Case Store — Manages clinical cases, coder decisions, audit decisions
// ============================================================================

interface CaseStoreState {
  cases: ClinicalCase[];
  activeCaseId: string | null;
  auditLog: AuditLogEntry[];

  // Case CRUD
  addCase: (c: ClinicalCase) => void;
  updateCase: (id: string, updates: Partial<ClinicalCase>) => void;
  deleteCase: (id: string) => void;
  setActiveCase: (id: string | null) => void;
  getActiveCase: () => ClinicalCase | undefined;
  getCasesByStatus: (status: CaseStatus) => ClinicalCase[];

  // System suggestions
  setSystemSuggestions: (caseId: string, suggestions: CodeCandidate[]) => void;
  setDocumentStructure: (caseId: string, ds: DocumentStructure) => void;
  setCrossValidation: (caseId: string, cv: CrossValidationResult) => void;
  setDRGSummary: (caseId: string, drg: DRGCaseSummary) => void;
  setHCCValidation: (caseId: string, hcc: HCCValidationResult) => void;

  // Coder decisions
  addCodeDecision: (caseId: string, decision: CodeDecision) => void;
  updateCodeDecision: (caseId: string, decisionId: string, updates: Partial<CodeDecision>) => void;
  removeCodeDecision: (caseId: string, decisionId: string) => void;
  submitForReview: (caseId: string) => void;

  // Auditor decisions
  addAuditDecision: (caseId: string, decision: AuditDecision) => void;
  bulkAutoApprove: (caseId: string, decisions: AuditDecision[]) => void;
  completeAudit: (caseId: string) => void;

  // Audit log
  addLogEntry: (entry: AuditLogEntry) => void;
  getLogForCase: (caseId: string) => AuditLogEntry[];

  // Metrics
  getAlignedCount: (caseId: string) => number;
  getDeltaCount: (caseId: string) => number;
  getAutoApprovedCount: (caseId: string) => number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useCaseStore = create<CaseStoreState>()(
  persist(
    (set, get) => ({
      cases: [],
      activeCaseId: null,
      auditLog: [],

      // ---- Case CRUD ----
      addCase: (c) => set((s) => ({ cases: [c, ...s.cases] })),

      updateCase: (id, updates) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
          ),
        })),

      deleteCase: (id) =>
        set((s) => ({
          cases: s.cases.filter((c) => c.id !== id),
          activeCaseId: s.activeCaseId === id ? null : s.activeCaseId,
        })),

      setActiveCase: (id) => set({ activeCaseId: id }),

      getActiveCase: () => {
        const { cases, activeCaseId } = get();
        return cases.find((c) => c.id === activeCaseId);
      },

      getCasesByStatus: (status) => get().cases.filter((c) => c.status === status),

      // ---- System Suggestions ----
      setSystemSuggestions: (caseId, suggestions) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId ? { ...c, systemSuggestions: suggestions, updatedAt: new Date().toISOString() } : c
          ),
        })),

      setDocumentStructure: (caseId, ds) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId ? { ...c, documentStructure: ds, updatedAt: new Date().toISOString() } : c
          ),
        })),

      setCrossValidation: (caseId, cv) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId ? { ...c, crossValidation: cv, updatedAt: new Date().toISOString() } : c
          ),
        })),

      setDRGSummary: (caseId, drg) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId ? { ...c, drgSummary: drg, updatedAt: new Date().toISOString() } : c
          ),
        })),

      setHCCValidation: (caseId, hcc) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId ? { ...c, hccValidation: hcc, updatedAt: new Date().toISOString() } : c
          ),
        })),

      // ---- Coder Decisions ----
      addCodeDecision: (caseId, decision) => {
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId
              ? { ...c, codeDecisions: [...c.codeDecisions, decision], updatedAt: new Date().toISOString() }
              : c
          ),
        }));
        // Add audit log entry
        get().addLogEntry({
          id: generateId(),
          caseId,
          timestamp: new Date().toISOString(),
          actor: 'coder',
          action: decision.coderAction,
          codeAffected: decision.coderFinalCode,
          details: decision.coderAction === 'accept'
            ? `Accepted system suggestion ${decision.systemSuggestedCode}`
            : decision.coderAction === 'modify'
            ? `Modified ${decision.systemSuggestedCode} → ${decision.coderFinalCode}: ${decision.coderReason || ''}`
            : decision.coderAction === 'reject'
            ? `Rejected ${decision.systemSuggestedCode}: ${decision.coderReason || ''}`
            : `Added new code ${decision.coderFinalCode}`,
        });
      },

      updateCodeDecision: (caseId, decisionId, updates) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId
              ? {
                  ...c,
                  codeDecisions: c.codeDecisions.map((d) =>
                    d.id === decisionId ? { ...d, ...updates } : d
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        })),

      removeCodeDecision: (caseId, decisionId) =>
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId
              ? {
                  ...c,
                  codeDecisions: c.codeDecisions.filter((d) => d.id !== decisionId),
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        })),

      submitForReview: (caseId) => {
        get().updateCase(caseId, { status: 'review' });
        get().addLogEntry({
          id: generateId(),
          caseId,
          timestamp: new Date().toISOString(),
          actor: 'coder',
          action: 'submit_for_review',
          details: 'Case submitted for auditor review',
        });
      },

      // ---- Auditor Decisions ----
      addAuditDecision: (caseId, decision) => {
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId
              ? { ...c, auditDecisions: [...c.auditDecisions, decision], updatedAt: new Date().toISOString() }
              : c
          ),
        }));
        get().addLogEntry({
          id: generateId(),
          caseId,
          timestamp: new Date().toISOString(),
          actor: decision.auditorAction === 'auto_approved' ? 'system' : 'auditor',
          action: decision.auditorAction,
          codeAffected: decision.auditorFinalCode,
          details: decision.auditorAction === 'auto_approved'
            ? `Auto-approved: ${decision.autoApprovalReason}`
            : `Auditor ${decision.auditorAction}: ${decision.auditorNotes || ''}`,
        });
      },

      bulkAutoApprove: (caseId, decisions) => {
        set((s) => ({
          cases: s.cases.map((c) =>
            c.id === caseId
              ? {
                  ...c,
                  auditDecisions: [...c.auditDecisions, ...decisions],
                  status: 'auditing' as CaseStatus,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        }));
        get().addLogEntry({
          id: generateId(),
          caseId,
          timestamp: new Date().toISOString(),
          actor: 'system',
          action: 'bulk_auto_approve',
          details: `Auto-approved ${decisions.length} aligned codes`,
        });
      },

      completeAudit: (caseId) => {
        get().updateCase(caseId, { status: 'complete' });
        get().addLogEntry({
          id: generateId(),
          caseId,
          timestamp: new Date().toISOString(),
          actor: 'auditor',
          action: 'complete_audit',
          details: 'Audit completed and case signed off',
        });
      },

      // ---- Audit Log ----
      addLogEntry: (entry) => set((s) => ({ auditLog: [entry, ...s.auditLog] })),

      getLogForCase: (caseId) => get().auditLog.filter((e) => e.caseId === caseId),

      // ---- Metrics ----
      getAlignedCount: (caseId) => {
        const c = get().cases.find((c) => c.id === caseId);
        return c ? c.codeDecisions.filter((d) => d.isAligned).length : 0;
      },

      getDeltaCount: (caseId) => {
        const c = get().cases.find((c) => c.id === caseId);
        return c ? c.codeDecisions.filter((d) => !d.isAligned).length : 0;
      },

      getAutoApprovedCount: (caseId) => {
        const c = get().cases.find((c) => c.id === caseId);
        return c ? c.auditDecisions.filter((d) => d.auditorAction === 'auto_approved').length : 0;
      },
    }),
    {
      name: 'clinical-coder-cases',
      partialize: (state) => ({
        cases: state.cases,
        auditLog: state.auditLog,
      }),
    }
  )
);
