import type { ConfidenceTier } from '@/types/icd10';
import { CheckCircle, AlertCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ConfidenceBadgeProps {
  confidence: number;
  tier?: ConfidenceTier;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ confidence, tier, showIcon = true, size = 'sm' }: ConfidenceBadgeProps) {
  const t = tier ?? getTier(confidence);
  const config = tierConfig[t];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${config.className} ${
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    }`}>
      {showIcon && <config.Icon size={size === 'sm' ? 12 : 14} />}
      <span>{Math.round(confidence * 100)}%</span>
    </span>
  );
}

export function TierBadge({ tier }: { tier: ConfidenceTier }) {
  const config = tierConfig[tier];
  return (
    <span className={`tier-badge ${config.tierClass}`}>
      {config.Icon && <config.Icon size={12} />}
      Tier {tier}
    </span>
  );
}

function getTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.95) return 1;
  if (confidence >= 0.80) return 2;
  if (confidence >= 0.50) return 3;
  return 4;
}

const tierConfig: Record<ConfidenceTier, { className: string; tierClass: string; Icon: typeof CheckCircle }> = {
  1: { className: 'bg-emerald-100 text-emerald-800', tierClass: 'tier-1', Icon: CheckCircle },
  2: { className: 'bg-blue-100 text-blue-800', tierClass: 'tier-2', Icon: AlertCircle },
  3: { className: 'bg-amber-100 text-amber-800', tierClass: 'tier-3', Icon: AlertTriangle },
  4: { className: 'bg-red-100 text-red-800', tierClass: 'tier-4', Icon: XCircle },
};
