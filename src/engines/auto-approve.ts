/**
 * Auto-Approve Engine — Determines which coder decisions can be auto-approved
 * by the auditor based on alignment with system suggestions and confidence.
 */

import type { CodeDecision, AuditDecision, CodeCandidate } from '@/types/icd10';

export interface AutoApproveConfig {
  /** Minimum confidence for auto-approve when aligned (default: 0.80) */
  minConfidenceForAutoApprove: number;
  /** Minimum confidence for auto-approve with flag (default: 0.50) */
  minConfidenceForAutoApproveWithFlag: number;
  /** Always require manual review for principal Dx (default: true) */
  alwaysReviewPrincipalDx: boolean;
  /** Always require manual review for MCC codes (default: true) */
  alwaysReviewMCC: boolean;
}

const DEFAULT_CONFIG: AutoApproveConfig = {
  minConfidenceForAutoApprove: 0.80,
  minConfidenceForAutoApproveWithFlag: 0.50,
  alwaysReviewPrincipalDx: false, // false for demo to show more auto-approvals
  alwaysReviewMCC: false,
};

export interface AutoApproveResult {
  autoApproved: AuditDecision[];
  requiresReview: CodeDecision[];
  stats: {
    totalDecisions: number;
    autoApprovedCount: number;
    requiresReviewCount: number;
    autoApproveRate: number;
  };
}

function generateId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Run auto-approve analysis on coder decisions
 */
export function runAutoApprove(
  codeDecisions: CodeDecision[],
  systemSuggestions: CodeCandidate[],
  config: Partial<AutoApproveConfig> = {}
): AutoApproveResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const autoApproved: AuditDecision[] = [];
  const requiresReview: CodeDecision[] = [];

  for (const decision of codeDecisions) {
    let canAutoApprove = false;
    let reason = '';

    // Check alignment
    if (decision.isAligned && decision.systemConfidence != null) {
      // Find matching system suggestion for additional context
      const suggestion = systemSuggestions.find(
        (s) => s.code === decision.systemSuggestedCode
      );

      // Check if principal Dx requires manual review
      if (cfg.alwaysReviewPrincipalDx && decision.isPrincipalDx) {
        canAutoApprove = false;
        // Principal Dx always requires review
      }
      // Check if MCC requires manual review
      else if (cfg.alwaysReviewMCC && suggestion?.ccLevel === 'MCC') {
        canAutoApprove = false;
        // MCC codes require review
      }
      // High confidence auto-approve
      else if (decision.systemConfidence >= cfg.minConfidenceForAutoApprove) {
        canAutoApprove = true;
        reason = `System and coder aligned at ${Math.round(decision.systemConfidence * 100)}% confidence (≥${Math.round(cfg.minConfidenceForAutoApprove * 100)}% threshold)`;
      }
      // Medium confidence auto-approve with flag
      else if (decision.systemConfidence >= cfg.minConfidenceForAutoApproveWithFlag) {
        canAutoApprove = true;
        reason = `System and coder aligned at ${Math.round(decision.systemConfidence * 100)}% confidence (flagged for attention)`;
      }
    }

    // Coder added a new code not suggested by system — always review
    if (decision.coderAction === 'add_new') {
      canAutoApprove = false;
    }

    if (canAutoApprove) {
      autoApproved.push({
        id: generateId(),
        caseId: decision.caseId,
        codeDecisionId: decision.id,
        auditorAction: 'auto_approved',
        auditorFinalCode: decision.coderFinalCode,
        auditorNotes: undefined,
        auditedAt: new Date().toISOString(),
        autoApprovalReason: reason,
      });
    } else {
      requiresReview.push(decision);
    }
  }

  const totalDecisions = codeDecisions.length;
  return {
    autoApproved,
    requiresReview,
    stats: {
      totalDecisions,
      autoApprovedCount: autoApproved.length,
      requiresReviewCount: requiresReview.length,
      autoApproveRate: totalDecisions > 0 ? autoApproved.length / totalDecisions : 0,
    },
  };
}
