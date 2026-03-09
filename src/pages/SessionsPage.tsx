import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/app-store';
import { ConfidenceBadge, TierBadge } from '@/components/common/ConfidenceBadge';
import {
  FileText, Clock, Search, Filter, Trash2, Eye, ChevronRight,
  CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';

export function SessionsPage() {
  const { sessions } = useAppStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = sessions.filter((s) => {
    const matchesSearch = !searchQuery || s.dischargeSummary.toLowerCase().includes(searchQuery.toLowerCase())
      || s.results.some((r) => r.code.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <FileText size={22} className="text-primary-500" /> Session History
        </h1>
        <p className="text-sm text-text-muted mt-0.5">
          {sessions.length} coding session{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="input-field pl-8 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field !w-auto text-sm"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Sessions table */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={40} className="text-text-muted mx-auto mb-3 opacity-30" />
          <p className="text-sm text-text-muted">
            {sessions.length === 0 ? 'No coding sessions yet' : 'No matching sessions'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-tertiary">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary">Summary</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary">Codes</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary">Confidence</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary">Tier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-text-secondary">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((session) => {
                const flagCount = session.results.filter((r) => r.redFlags.length > 0).length;
                return (
                  <tr
                    key={session.id}
                    className="hover:bg-surface-tertiary cursor-pointer transition-colors"
                    onClick={() => navigate('/coding')}
                  >
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-primary max-w-[300px] truncate">
                      {session.dischargeSummary.substring(0, 80)}...
                    </td>
                    <td className="px-4 py-3 text-center text-xs font-semibold text-text-primary">
                      {session.results.length}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ConfidenceBadge confidence={session.overallConfidence} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TierBadge tier={session.overallTier} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {flagCount > 0 ? (
                        <span className="flex items-center justify-center gap-0.5 text-amber-600 text-xs">
                          <AlertTriangle size={12} /> {flagCount}
                        </span>
                      ) : (
                        <span className="text-emerald-600 text-xs">&#10003;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    draft: { bg: 'bg-slate-100', text: 'text-slate-600', icon: <FileText size={10} /> },
    pending_review: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock size={10} /> },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle size={10} /> },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle size={10} /> },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>
      {c.icon} {status.replace('_', ' ')}
    </span>
  );
}
