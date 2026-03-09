/**
 * Fraud Pattern Detection Engine — Provider-level outlier scoring
 * using Z-score peer comparison, temporal anomaly detection,
 * and utilization analysis.
 */

import type {
  ClaimRecord, ProviderProfile, FraudFlag, FraudFlagType, PeerBaseline
} from '@/types/icd10';

// ---- Feature Computation ----

interface ProviderFeatures {
  providerId: string;
  providerName: string;
  specialty: string;
  totalClaims: number;
  totalPaid: number;
  claimsPerMonth: number;
  avgPaidPerClaim: number;
  avgCodesPerClaim: number;
  complexityRatio: number;     // Ratio of high-complexity codes
  weekendRate: number;          // % of claims on weekends
  topCodes: { code: string; count: number; percentOfClaims: number }[];
  monthlyTrend: { month: string; claims: number; paid: number }[];
  uniquePatients: number;
  avgClaimsPerPatient: number;
}

/**
 * Compute features for a single provider
 */
function computeProviderFeatures(
  providerId: string,
  claims: ClaimRecord[],
  allClaims: ClaimRecord[]
): ProviderFeatures {
  const providerClaims = claims.filter(c => c.providerId === providerId);
  if (providerClaims.length === 0) {
    return {
      providerId, providerName: '', specialty: '', totalClaims: 0, totalPaid: 0,
      claimsPerMonth: 0, avgPaidPerClaim: 0, avgCodesPerClaim: 0, complexityRatio: 0,
      weekendRate: 0, topCodes: [], monthlyTrend: [], uniquePatients: 0, avgClaimsPerPatient: 0,
    };
  }

  const specialty = providerClaims[0].providerSpecialty;
  const providerName = `Provider ${providerId}`;
  const totalClaims = providerClaims.length;
  const totalPaid = providerClaims.reduce((s, c) => s + c.paidAmount, 0);
  const totalCodes = providerClaims.reduce((s, c) => s + c.codes.length, 0);

  // Monthly breakdown
  const monthlyMap = new Map<string, { claims: number; paid: number }>();
  for (const c of providerClaims) {
    const month = c.serviceDate.substring(0, 7); // YYYY-MM
    const entry = monthlyMap.get(month) || { claims: 0, paid: 0 };
    entry.claims++;
    entry.paid += c.paidAmount;
    monthlyMap.set(month, entry);
  }
  const monthlyTrend = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const months = monthlyTrend.length || 1;

  // High-complexity codes (MCC-related)
  const highComplexityCodes = providerClaims.reduce((sum, c) => {
    return sum + c.codes.filter(code =>
      /^A4[01]|^I21|^I46|^J96|^N17|^R65\.2/.test(code)
    ).length;
  }, 0);

  // Weekend claims
  const weekendClaims = providerClaims.filter(c => {
    const d = new Date(c.serviceDate);
    return d.getDay() === 0 || d.getDay() === 6;
  }).length;

  // Top codes
  const codeCount = new Map<string, number>();
  for (const c of providerClaims) {
    for (const code of c.codes) {
      codeCount.set(code, (codeCount.get(code) || 0) + 1);
    }
  }
  const topCodes = Array.from(codeCount.entries())
    .map(([code, count]) => ({ code, count, percentOfClaims: (count / totalClaims) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Unique patients
  const uniquePatients = new Set(providerClaims.map(c => c.memberIdHash)).size;

  return {
    providerId,
    providerName,
    specialty,
    totalClaims,
    totalPaid,
    claimsPerMonth: totalClaims / months,
    avgPaidPerClaim: totalPaid / totalClaims,
    avgCodesPerClaim: totalCodes / totalClaims,
    complexityRatio: totalCodes > 0 ? highComplexityCodes / totalCodes : 0,
    weekendRate: totalClaims > 0 ? weekendClaims / totalClaims : 0,
    topCodes,
    monthlyTrend,
    uniquePatients,
    avgClaimsPerPatient: uniquePatients > 0 ? totalClaims / uniquePatients : 0,
  };
}

/**
 * Compute peer baseline for a specialty
 */
export function computePeerBaseline(
  features: ProviderFeatures[],
  specialty: string
): PeerBaseline {
  const peers = features.filter(f => f.specialty === specialty);
  if (peers.length === 0) {
    return {
      specialty, avgClaimsPerMonth: 0, avgPaidPerClaim: 0, avgCodesPerClaim: 0,
      avgComplexityRatio: 0, stdClaimsPerMonth: 0, stdPaidPerClaim: 0,
      stdCodesPerClaim: 0, stdComplexityRatio: 0, providerCount: 0,
    };
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const std = (arr: number[], mean: number) =>
    Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);

  const claimsPerMonth = peers.map(p => p.claimsPerMonth);
  const paidPerClaim = peers.map(p => p.avgPaidPerClaim);
  const codesPerClaim = peers.map(p => p.avgCodesPerClaim);
  const complexity = peers.map(p => p.complexityRatio);

  const avgCPM = avg(claimsPerMonth);
  const avgPPC = avg(paidPerClaim);
  const avgCPC = avg(codesPerClaim);
  const avgCR = avg(complexity);

  return {
    specialty,
    avgClaimsPerMonth: avgCPM,
    avgPaidPerClaim: avgPPC,
    avgCodesPerClaim: avgCPC,
    avgComplexityRatio: avgCR,
    stdClaimsPerMonth: std(claimsPerMonth, avgCPM) || 1,
    stdPaidPerClaim: std(paidPerClaim, avgPPC) || 1,
    stdCodesPerClaim: std(codesPerClaim, avgCPC) || 1,
    stdComplexityRatio: std(complexity, avgCR) || 0.01,
    providerCount: peers.length,
  };
}

/**
 * Detect anomalies for a single provider
 */
function detectAnomalies(
  features: ProviderFeatures,
  baseline: PeerBaseline
): FraudFlag[] {
  const flags: FraudFlag[] = [];

  // Z-score helper
  const zScore = (value: number, mean: number, std: number) =>
    std > 0 ? (value - mean) / std : 0;

  // 1. High utilization
  const utilZ = zScore(features.claimsPerMonth, baseline.avgClaimsPerMonth, baseline.stdClaimsPerMonth);
  if (utilZ > 2.0) {
    flags.push({
      type: 'high_utilization',
      severity: utilZ > 3.0 ? 'high' : 'medium',
      explanation: `${features.claimsPerMonth.toFixed(1)} claims/month vs peer average ${baseline.avgClaimsPerMonth.toFixed(1)} (Z=${utilZ.toFixed(2)})`,
      evidence: {
        metric: 'Claims per Month',
        providerValue: features.claimsPerMonth,
        peerAvg: baseline.avgClaimsPerMonth,
        zScore: utilZ,
      },
    });
  }

  // 2. Upcoding (high avg paid per claim)
  const paidZ = zScore(features.avgPaidPerClaim, baseline.avgPaidPerClaim, baseline.stdPaidPerClaim);
  if (paidZ > 2.0) {
    flags.push({
      type: 'upcoding',
      severity: paidZ > 3.0 ? 'high' : 'medium',
      explanation: `$${features.avgPaidPerClaim.toFixed(2)}/claim vs peer average $${baseline.avgPaidPerClaim.toFixed(2)} (Z=${paidZ.toFixed(2)})`,
      evidence: {
        metric: 'Avg Paid per Claim',
        providerValue: features.avgPaidPerClaim,
        peerAvg: baseline.avgPaidPerClaim,
        zScore: paidZ,
      },
    });
  }

  // 3. High complexity ratio
  const complexZ = zScore(features.complexityRatio, baseline.avgComplexityRatio, baseline.stdComplexityRatio);
  if (complexZ > 2.0) {
    flags.push({
      type: 'high_complexity_ratio',
      severity: complexZ > 3.0 ? 'high' : 'medium',
      explanation: `${(features.complexityRatio * 100).toFixed(1)}% high-complexity codes vs peer average ${(baseline.avgComplexityRatio * 100).toFixed(1)}% (Z=${complexZ.toFixed(2)})`,
      evidence: {
        metric: 'High-Complexity Code Ratio',
        providerValue: features.complexityRatio,
        peerAvg: baseline.avgComplexityRatio,
        zScore: complexZ,
      },
    });
  }

  // 4. Temporal spike (month-over-month)
  if (features.monthlyTrend.length >= 3) {
    const lastMonth = features.monthlyTrend[features.monthlyTrend.length - 1];
    const prevMonths = features.monthlyTrend.slice(0, -1);
    const avgPrevClaims = prevMonths.reduce((s, m) => s + m.claims, 0) / prevMonths.length;
    const spikeRatio = avgPrevClaims > 0 ? lastMonth.claims / avgPrevClaims : 0;

    if (spikeRatio > 2.0) {
      flags.push({
        type: 'temporal_spike',
        severity: spikeRatio > 3.0 ? 'high' : 'medium',
        explanation: `Latest month: ${lastMonth.claims} claims vs previous average ${avgPrevClaims.toFixed(0)} (${spikeRatio.toFixed(1)}x increase)`,
        evidence: {
          metric: 'Monthly Claims Spike',
          providerValue: lastMonth.claims,
          peerAvg: avgPrevClaims,
          zScore: spikeRatio,
        },
      });
    }
  }

  // 5. Impossible day (>24 services in a single day)
  const dailyMap = new Map<string, number>();
  // We approximate from monthlyTrend — in real system would use daily data
  if (features.claimsPerMonth > 600) { // ~20/day average
    flags.push({
      type: 'impossible_day',
      severity: 'high',
      explanation: `${features.claimsPerMonth.toFixed(0)} claims/month suggests potential impossible service days`,
      evidence: {
        metric: 'Claims per Month',
        providerValue: features.claimsPerMonth,
        peerAvg: baseline.avgClaimsPerMonth,
        zScore: utilZ,
      },
    });
  }

  return flags;
}

/**
 * Compute risk score from flags (0-100)
 */
function computeRiskScore(flags: FraudFlag[]): number {
  if (flags.length === 0) return 0;

  let score = 0;
  for (const flag of flags) {
    switch (flag.severity) {
      case 'high': score += 30; break;
      case 'medium': score += 15; break;
      case 'low': score += 5; break;
    }
    // Additional weight based on Z-score magnitude
    score += Math.min(Math.abs(flag.evidence.zScore) * 5, 20);
  }

  return Math.min(score, 100);
}

/**
 * Build provider profiles from claims data
 */
export function buildProviderProfiles(claims: ClaimRecord[]): ProviderProfile[] {
  // Get unique providers
  const providerIds = [...new Set(claims.map(c => c.providerId))];

  // Compute features for all providers
  const allFeatures = providerIds.map(id =>
    computeProviderFeatures(id, claims, claims)
  );

  // Compute peer baselines per specialty
  const specialties = [...new Set(allFeatures.map(f => f.specialty))];
  const baselines = new Map<string, PeerBaseline>();
  for (const specialty of specialties) {
    baselines.set(specialty, computePeerBaseline(allFeatures, specialty));
  }

  // Build profiles with anomaly detection
  return allFeatures.map(features => {
    const baseline = baselines.get(features.specialty)!;
    const riskFlags = detectAnomalies(features, baseline);
    const riskScore = computeRiskScore(riskFlags);

    return {
      providerId: features.providerId,
      providerName: features.providerName,
      specialty: features.specialty,
      totalClaims: features.totalClaims,
      totalPaid: features.totalPaid,
      utilizationRate: features.claimsPerMonth,
      avgCodesPerClaim: features.avgCodesPerClaim,
      avgPaidPerClaim: features.avgPaidPerClaim,
      topCodes: features.topCodes,
      riskScore,
      riskFlags,
      monthlyTrend: features.monthlyTrend,
    };
  });
}
