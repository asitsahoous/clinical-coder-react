import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { ConfidenceBadge, TierBadge } from '@/components/common/ConfidenceBadge';
import { RedFlagAlert } from '@/components/common/RedFlagAlert';
import type { CodingSession, CodingResult } from '@/types/icd10';
import {
  Shield, FileText, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronRight, ChevronDown, MessageSquare, ThumbsUp, ThumbsDown
} from 'lucide-react';

export function AuditPage() {
  const { sessions, updateSession } = useAppStore();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [auditNotes, setAuditNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const reviewableSessions = sessions.filter((s) =>
    statusFilter === 'all' ? true : s.status === statusFilter
  );

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const handleApprove = (id: string) => {
    updateSession(id, { status: 'approved', reviewedBy: 'Auditor', reviewNotes: auditNotes });
    setAuditNotes('');
    setSelectedSessionId(null);
  };

  const handleReject = (id: string) => {
    updateSession(id, { status: 'rejected', reviewedBy: 'Auditor', reviewNotes: auditNotes });
    setAuditNotes('');
    setSelectedSessionId(null);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto animate-fade-in">
      {/* Left: Session List */}
      <div className="lg:w-1/3 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Shield size={22} className="text-amber-500" /> Audit Workspace
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Review and validate coding sessions
          </p>
        </div>

        {/* Filter */}
        <div className="flex bg-surface-tertiary rounded-lg p-0.5">
          {[
            { value: 'all', label: 'All' },
            { value: 'pending_review', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                statusFilter === value ? 'bg-amber-600 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-auto space-y-2">
          {reviewableSessions.length === 0 ? (
            <div className="card p-8 text-center">
              <Shield size={32} className="text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-sm text-text-muted">No sessions to review</p>
              <p className="text-xs text-text-muted mt-1">Sessions will appear here after coding analysis</p>
            </div>
          ) : (
            reviewableSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                className={`w-full card p-3 text-left transition-all cursor-pointer ${
                  selectedSessionId === session.id ? 'ring-2 ring-amber-300' : 'hover:border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <StatusIcon status={session.status} />
                  <TierBadge tier={session.overallTier} />
                </div>
                <p className="text-xs text-text-primary truncate">{session.dischargeSummary.substring(0, 100)}...</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
                  <span>{session.results.length} codes</span>
                  <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                  <span>
                    {session.results.filter((r) => r.redFlags.length > 0).length > 0 && (
                      <span className="text-amber-600 flex items-center gap-0.5">
                        <AlertTriangle size={10} /> {session.results.filter((r) => r.redFlags.length > 0).length} flags
                      </span>
                    )}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="lg:w-2/3 flex flex-col gap-4">
        {selectedSession ? (
          <SessionDetail
            session={selectedSession}
            auditNotes={auditNotes}
            setAuditNotes={setAuditNotes}
            onApprove={() => handleApprove(selectedSession.id)}
            onReject={() => handleReject(selectedSession.id)}
          />
        ) : (
          <div className="flex-1 card flex items-center justify-center">
            <div className="text-center">
              <Shield size={40} className="text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-sm text-text-muted">Select a session to review</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetail({
  session, auditNotes, setAuditNotes, onApprove, onReject,
}: {
  session: CodingSession;
  auditNotes: string;
  setAuditNotes: (n: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  return (
    <>
      {/* Session header */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <StatusIcon status={session.status} />
            <div>
              <p className="text-sm font-medium text-text-primary">Session {session.id.slice(0, 8)}</p>
              <p className="text-xs text-text-muted">{new Date(session.createdAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={session.overallConfidence} size="md" />
            <TierBadge tier={session.overallTier} />
          </div>
        </div>

        {/* Summary excerpt */}
        <div className="bg-surface-tertiary rounded-lg p-3 text-xs text-text-secondary font-mono max-h-32 overflow-auto">
          {session.dischargeSummary.substring(0, 500)}...
        </div>
      </div>

      {/* Codes */}
      <div className="flex-1 overflow-auto space-y-2">
        {session.results.map((result) => (
          <div key={result.code} className={`card ${result.redFlags.length > 0 ? 'border-l-4 border-l-amber-400' : ''}`}>
            <div
              className="p-3 flex items-center gap-3 cursor-pointer"
              onClick={() => setExpandedCode(expandedCode === result.code ? null : result.code)}
            >
              <span className="w-5 h-5 rounded-full bg-surface-tertiary flex items-center justify-center text-[9px] font-bold text-text-muted">
                #{result.sequenceOrder}
              </span>
              <span className="font-mono text-sm font-bold text-primary-700">{result.code}</span>
              <span className="text-xs text-text-primary flex-1 truncate">{result.description}</span>
              <RedFlagAlert flags={result.redFlags} compact />
              <ConfidenceBadge confidence={result.confidence} />
            </div>
            {expandedCode === result.code && (
              <div className="px-3 pb-3 border-t border-border pt-3 space-y-2 animate-fade-in">
                {result.matchedTerms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.matchedTerms.map((t, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-[10px]">{t}</span>
                    ))}
                  </div>
                )}
                <RedFlagAlert flags={result.redFlags} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Audit actions */}
      {session.status !== 'approved' && session.status !== 'rejected' && (
        <div className="card p-4 space-y-3">
          <textarea
            value={auditNotes}
            onChange={(e) => setAuditNotes(e.target.value)}
            placeholder="Add audit notes..."
            className="input-field text-sm h-20 resize-none"
          />
          <div className="flex items-center gap-2">
            <button onClick={onApprove} className="btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700">
              <ThumbsUp size={14} /> Approve
            </button>
            <button onClick={onReject} className="btn-danger flex items-center gap-2">
              <ThumbsDown size={14} /> Reject
            </button>
          </div>
        </div>
      )}

      {session.reviewNotes && (
        <div className="card p-4 bg-surface-tertiary">
          <p className="text-xs font-semibold text-text-secondary flex items-center gap-1 mb-1">
            <MessageSquare size={12} /> Audit Notes
          </p>
          <p className="text-xs text-text-muted">{session.reviewNotes}</p>
        </div>
      )}
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; className: string }> = {
    draft: { icon: <FileText size={14} />, className: 'bg-slate-100 text-slate-600' },
    pending_review: { icon: <Clock size={14} />, className: 'bg-amber-100 text-amber-700' },
    approved: { icon: <CheckCircle size={14} />, className: 'bg-emerald-100 text-emerald-700' },
    rejected: { icon: <XCircle size={14} />, className: 'bg-red-100 text-red-700' },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${c.className}`}>
      {c.icon} {status.replace('_', ' ')}
    </span>
  );
}
