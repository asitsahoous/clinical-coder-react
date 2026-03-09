import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Shield, TrendingUp, Users, DollarSign, BarChart3, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ProviderProfile, FraudFlag } from '@/types/icd10';
import { buildProviderProfiles } from '@/engines/fraud-engine';
import { getSyntheticClaims } from '@/data/synthetic-claims';

// ---- Sub-components ----

function RiskBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-100 text-red-800 border-red-300' :
    score >= 40 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
    score >= 20 ? 'bg-blue-100 text-blue-800 border-blue-300' :
    'bg-green-100 text-green-800 border-green-300';
  return (
    <span className={`text-sm font-bold px-2.5 py-1 rounded-full border ${color}`}>
      {score}
    </span>
  );
}

function FlagCard({ flag }: { flag: FraudFlag }) {
  const colors = {
    high: 'border-red-200 bg-red-50 dark:bg-red-900/20',
    medium: 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20',
    low: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20',
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[flag.severity]}`}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={14} />
        <span className="font-semibold text-xs uppercase">{flag.type.replace(/_/g, ' ')}</span>
        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-bold
          ${flag.severity === 'high' ? 'bg-red-200 text-red-800' : flag.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-200 text-blue-800'}`}>
          {flag.severity}
        </span>
      </div>
      <p className="text-sm">{flag.explanation}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
        <div><span className="font-semibold">Provider:</span> {flag.evidence.providerValue.toFixed(1)}</div>
        <div><span className="font-semibold">Peer Avg:</span> {flag.evidence.peerAvg.toFixed(1)}</div>
        <div><span className="font-semibold">Z-Score:</span> {flag.evidence.zScore.toFixed(2)}</div>
      </div>
    </div>
  );
}

function ProviderDetailPanel({ provider }: { provider: ProviderProfile }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 pb-3 border-b">
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg font-bold">
          {provider.providerId.split('-')[1]}
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-lg">{provider.providerName}</h3>
          <p className="text-sm text-gray-500">{provider.specialty} · {provider.providerId}</p>
        </div>
        <RiskBadge score={provider.riskScore} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Claims</p>
          <p className="text-xl font-bold">{provider.totalClaims.toLocaleString()}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Total Paid</p>
          <p className="text-xl font-bold">${provider.totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Claims/Month</p>
          <p className="text-xl font-bold">{provider.utilizationRate.toFixed(1)}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Avg $/Claim</p>
          <p className="text-xl font-bold">${provider.avgPaidPerClaim.toFixed(0)}</p>
        </div>
      </div>

      {/* Claims Trend Chart */}
      {provider.monthlyTrend.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
          <h4 className="font-semibold mb-3">Monthly Claims Trend</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={provider.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="claims" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {provider.monthlyTrend.map((_, i) => (
                  <Cell key={i} fill={i === provider.monthlyTrend.length - 1 && provider.riskFlags.some(f => f.type === 'temporal_spike') ? '#ef4444' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Risk Flags */}
      {provider.riskFlags.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Risk Flags ({provider.riskFlags.length})</h4>
          <div className="space-y-2">
            {provider.riskFlags.map((flag, i) => (
              <FlagCard key={i} flag={flag} />
            ))}
          </div>
        </div>
      )}

      {/* Top Codes */}
      {provider.topCodes.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
          <h4 className="font-semibold mb-2">Top Codes</h4>
          <div className="space-y-1">
            {provider.topCodes.slice(0, 8).map(tc => (
              <div key={tc.code} className="flex items-center gap-2 text-sm">
                <span className="font-mono w-16">{tc.code}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${tc.percentOfClaims}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-16 text-right">{tc.percentOfClaims.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----

export default function FraudDashboardPage() {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderProfile | null>(null);
  const [sortBy, setSortBy] = useState<'risk' | 'claims' | 'paid'>('risk');
  const [searchQuery, setSearchQuery] = useState('');

  // Load and analyze claims on mount
  useEffect(() => {
    setLoading(true);
    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      const claims = getSyntheticClaims();
      const providerProfiles = buildProviderProfiles(claims);
      setProfiles(providerProfiles);
      setLoading(false);
    }, 100);
  }, []);

  // Sort and filter
  const sortedProfiles = useMemo(() => {
    let filtered = profiles;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = profiles.filter(p =>
        p.providerId.toLowerCase().includes(q) ||
        p.specialty.toLowerCase().includes(q) ||
        p.providerName.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'risk': return b.riskScore - a.riskScore;
        case 'claims': return b.totalClaims - a.totalClaims;
        case 'paid': return b.totalPaid - a.totalPaid;
      }
    });
  }, [profiles, sortBy, searchQuery]);

  // Summary stats
  const highRiskCount = profiles.filter(p => p.riskScore >= 70).length;
  const medRiskCount = profiles.filter(p => p.riskScore >= 40 && p.riskScore < 70).length;
  const totalFlags = profiles.reduce((s, p) => s + p.riskFlags.length, 0);
  const totalClaims = profiles.reduce((s, p) => s + p.totalClaims, 0);

  // Risk distribution chart data
  const riskDistribution = useMemo(() => {
    const buckets = [
      { range: '0-19', count: 0, color: '#22c55e' },
      { range: '20-39', count: 0, color: '#3b82f6' },
      { range: '40-69', count: 0, color: '#eab308' },
      { range: '70-100', count: 0, color: '#ef4444' },
    ];
    for (const p of profiles) {
      if (p.riskScore < 20) buckets[0].count++;
      else if (p.riskScore < 40) buckets[1].count++;
      else if (p.riskScore < 70) buckets[2].count++;
      else buckets[3].count++;
    }
    return buckets;
  }, [profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Analyzing {profiles.length > 0 ? profiles.length : '50'} providers across synthetic claims...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-red-600" />
          <div>
            <h1 className="text-xl font-bold">Fraud Pattern Detection</h1>
            <p className="text-sm text-gray-500">Provider-level outlier analysis · {totalClaims.toLocaleString()} claims · {profiles.length} providers</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 border-b bg-gray-50 dark:bg-gray-900">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertTriangle size={16} />
              <span className="text-xs uppercase font-semibold">High Risk</span>
            </div>
            <p className="text-3xl font-bold">{highRiskCount}</p>
            <p className="text-xs text-gray-500">providers (score ≥ 70)</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <TrendingUp size={16} />
              <span className="text-xs uppercase font-semibold">Medium Risk</span>
            </div>
            <p className="text-3xl font-bold">{medRiskCount}</p>
            <p className="text-xs text-gray-500">providers (score 40-69)</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <BarChart3 size={16} />
              <span className="text-xs uppercase font-semibold">Total Flags</span>
            </div>
            <p className="text-3xl font-bold">{totalFlags}</p>
            <p className="text-xs text-gray-500">anomalies detected</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Users size={16} />
              <span className="text-xs uppercase font-semibold">Providers</span>
            </div>
            <p className="text-3xl font-bold">{profiles.length}</p>
            <p className="text-xs text-gray-500">analyzed across {totalClaims.toLocaleString()} claims</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Provider List */}
        <div className="w-96 border-r flex flex-col">
          {/* Search + Sort */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800"
              />
            </div>
            <div className="flex gap-1">
              {(['risk', 'claims', 'paid'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors
                    ${sortBy === s ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white dark:bg-gray-800'}`}
                >
                  {s === 'risk' ? 'Risk Score' : s === 'claims' ? 'Claims' : 'Paid Amount'}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Distribution */}
          <div className="p-3 border-b">
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={riskDistribution} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="range" type="category" width={45} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {riskDistribution.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Provider List */}
          <div className="flex-1 overflow-y-auto">
            {sortedProfiles.map(p => (
              <button
                key={p.providerId}
                onClick={() => setSelectedProvider(p)}
                className={`w-full text-left p-3 border-b transition-colors flex items-center gap-3
                  ${selectedProvider?.providerId === p.providerId ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                <RiskBadge score={p.riskScore} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{p.providerId}</p>
                  <p className="text-xs text-gray-500">{p.specialty}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{p.totalClaims} claims</p>
                  <p>${p.avgPaidPerClaim.toFixed(0)}/claim</p>
                </div>
                {p.riskFlags.length > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{p.riskFlags.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Provider Detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedProvider ? (
            <ProviderDetailPanel provider={selectedProvider} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Shield size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg">Select a provider to view details</p>
                <p className="text-sm mt-1">Providers are ranked by fraud risk score.</p>
                <p className="text-xs mt-2 text-gray-300">
                  {highRiskCount} high-risk providers detected. Click one to investigate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
