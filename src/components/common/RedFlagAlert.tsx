import type { RedFlag } from '@/types/icd10';
import { AlertTriangle, XCircle, Info } from 'lucide-react';

interface RedFlagAlertProps {
  flags: RedFlag[];
  compact?: boolean;
}

export function RedFlagAlert({ flags, compact = false }: RedFlagAlertProps) {
  if (flags.length === 0) return null;

  const errors = flags.filter((f) => f.severity === 'error');
  const warnings = flags.filter((f) => f.severity === 'warning');
  const infos = flags.filter((f) => f.severity === 'info');

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {errors.length > 0 && (
          <span className="flex items-center gap-0.5 text-red-600 text-xs font-medium">
            <XCircle size={12} /> {errors.length}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-0.5 text-amber-600 text-xs font-medium">
            <AlertTriangle size={12} /> {warnings.length}
          </span>
        )}
        {infos.length > 0 && (
          <span className="flex items-center gap-0.5 text-blue-600 text-xs font-medium">
            <Info size={12} /> {infos.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {flags.map((flag, i) => {
        const severityConfig = {
          error: { bg: 'bg-red-50 border-red-400', icon: <XCircle size={14} className="text-red-600" />, text: 'text-red-800' },
          warning: { bg: 'bg-amber-50 border-amber-400', icon: <AlertTriangle size={14} className="text-amber-600" />, text: 'text-amber-800' },
          info: { bg: 'bg-blue-50 border-blue-400', icon: <Info size={14} className="text-blue-600" />, text: 'text-blue-800' },
        }[flag.severity];

        return (
          <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border-l-4 ${severityConfig.bg}`}>
            {severityConfig.icon}
            <div className="flex-1">
              <p className={`text-xs font-medium ${severityConfig.text}`}>{flag.message}</p>
              {flag.suggestedAction && (
                <p className="text-xs text-text-muted mt-0.5">{flag.suggestedAction}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
