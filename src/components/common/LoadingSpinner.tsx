import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

export function LoadingSpinner({ message = 'Loading...', size = 'md', fullPage = false }: LoadingSpinnerProps) {
  const sizeMap = { sm: 16, md: 24, lg: 40 };

  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 size={sizeMap[size]} className="animate-spin text-primary-500" />
      {message && <p className={`text-text-muted ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>{message}</p>}
    </div>
  );

  if (fullPage) {
    return <div className="flex items-center justify-center h-full min-h-[400px]">{content}</div>;
  }
  return content;
}

export function DataLoadingOverlay({ progress }: { progress: { cm: boolean; pcs: boolean; details: boolean; tables: boolean } }) {
  const items = [
    { key: 'cm', label: 'ICD-10-CM Diagnosis Codes (72,616)', done: progress.cm },
    { key: 'pcs', label: 'ICD-10-PCS Procedure Codes (78,705)', done: progress.pcs },
    { key: 'details', label: 'Code Detail Metadata', done: progress.details },
    { key: 'tables', label: 'PCS Table Structures', done: progress.tables },
  ];

  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="card p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-primary-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-text-primary">Loading Code Database</h2>
          <p className="text-sm text-text-muted mt-1">Preparing 151,321 ICD-10 codes...</p>
        </div>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                item.done ? 'bg-emerald-100 text-emerald-600' : 'bg-surface-tertiary'
              }`}>
                {item.done ? '✓' : <Loader2 size={12} className="animate-spin text-text-muted" />}
              </div>
              <span className={`text-sm ${item.done ? 'text-text-primary' : 'text-text-muted'}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
