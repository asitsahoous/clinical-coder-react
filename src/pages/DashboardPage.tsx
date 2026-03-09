import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/app-store';
import { useCodeDatabase } from '@/stores/code-database-store';
import {
  BarChart3, FileText, CheckCircle, Clock, AlertTriangle, TrendingUp,
  ArrowRight, Activity, Shield, BookOpen
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const TIER_COLORS = ['#059669', '#2563eb', '#d97706', '#dc2626'];

export function DashboardPage() {
  const { dashboardMetrics, sessions, persona, updateDashboardMetrics } = useAppStore();
  const totalCodes = useCodeDatabase((s) => s.getTotalCodeCount());
  const navigate = useNavigate();

  useEffect(() => { updateDashboardMetrics(); }, [sessions.length, updateDashboardMetrics]);

  const tierData = Object.entries(dashboardMetrics.tierDistribution).map(([tier, count]) => ({
    name: `Tier ${tier}`,
    value: count,
  }));

  const recentSessions = sessions.slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Welcome Banner */}
      <div className="card p-6 bg-gradient-to-r from-primary-600 to-primary-800 text-white border-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {persona === 'coder' ? 'Clinical Coder Dashboard' : 'Audit Dashboard'}
            </h1>
            <p className="text-primary-100 mt-1">
              ICD-10-CM/PCS 2026 &middot; {totalCodes.toLocaleString()} codes loaded
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate('/coding')} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Activity size={16} /> New Coding Session
            </button>
            <button onClick={() => navigate('/browse')} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <BookOpen size={16} /> Browse Codes
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Sessions"
          value={dashboardMetrics.totalSessions}
          icon={<FileText size={20} />}
          color="primary"
        />
        <MetricCard
          label="Auto-Approved"
          value={dashboardMetrics.autoApproved}
          icon={<CheckCircle size={20} />}
          color="emerald"
          subtext={dashboardMetrics.totalSessions > 0 ? `${Math.round((dashboardMetrics.autoApproved / dashboardMetrics.totalSessions) * 100)}%` : undefined}
        />
        <MetricCard
          label="Pending Review"
          value={dashboardMetrics.pendingReview}
          icon={<Clock size={20} />}
          color="amber"
        />
        <MetricCard
          label="Avg Confidence"
          value={`${dashboardMetrics.codingAccuracy}%`}
          icon={<TrendingUp size={20} />}
          color="blue"
        />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Tier Distribution */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <BarChart3 size={16} /> Confidence Tier Distribution
          </h3>
          {dashboardMetrics.totalSessions > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tierData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {tierData.map((_, i) => <Cell key={i} fill={TIER_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No sessions yet. Start coding to see tier distribution." />
          )}
          <div className="flex justify-center gap-4 mt-2">
            {['Auto-approve', 'Light Review', 'Full Review', 'Expert'].map((label, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-text-muted">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLORS[i] }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Top Codes */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp size={16} /> Top Assigned Codes
          </h3>
          {dashboardMetrics.topCodes.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dashboardMetrics.topCodes.slice(0, 5)} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="code" width={60} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number, _name: string, props: { payload: { desc: string } }) => [value, props.payload.desc]} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Complete coding sessions to see frequently assigned codes." />
          )}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Clock size={16} /> Recent Sessions
          </h3>
          {sessions.length > 0 && (
            <button onClick={() => navigate('/sessions')} className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View All <ArrowRight size={12} />
            </button>
          )}
        </div>
        {recentSessions.length > 0 ? (
          <div className="divide-y divide-border">
            {recentSessions.map((session) => (
              <div key={session.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {session.dischargeSummary.substring(0, 80)}...
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {session.results.length} codes &middot; {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`tier-badge tier-${session.overallTier}`}>
                    Tier {session.overallTier}
                  </span>
                  <StatusBadge status={session.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            message="No coding sessions yet. Start analyzing a discharge summary!"
            action={
              <button onClick={() => navigate('/coding')} className="btn-primary text-sm mt-3">
                <Activity size={14} className="inline mr-1" /> Start Coding
              </button>
            }
          />
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <QuickAction
          title="Start Coding"
          desc="Analyze a discharge summary"
          icon={<Activity size={24} />}
          color="primary"
          onClick={() => navigate('/coding')}
        />
        <QuickAction
          title="Browse Codes"
          desc="Search ICD-10 CM/PCS codes"
          icon={<BookOpen size={24} />}
          color="emerald"
          onClick={() => navigate('/browse')}
        />
        <QuickAction
          title={persona === 'auditor' ? 'Start Audit' : 'Review Sessions'}
          desc={persona === 'auditor' ? 'Review coding accuracy' : 'View past sessions'}
          icon={<Shield size={24} />}
          color="amber"
          onClick={() => navigate(persona === 'auditor' ? '/audit' : '/sessions')}
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color, subtext }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; subtext?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-${color}-500`}>{icon}</span>
        {subtext && <span className="text-xs text-text-muted">{subtext}</span>}
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

function QuickAction({ title, desc, icon, color, onClick }: {
  title: string; desc: string; icon: React.ReactNode; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-5 text-left hover:border-${color}-300 hover:shadow-md transition-all group cursor-pointer`}
    >
      <div className={`text-${color}-500 mb-3 group-hover:scale-110 transition-transform`}>{icon}</div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-xs text-text-muted mt-1">{desc}</p>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
    pending_review: { bg: 'bg-amber-100', text: 'text-amber-700' },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-8">
      <AlertTriangle size={24} className="text-text-muted mx-auto mb-2" />
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  );
}
