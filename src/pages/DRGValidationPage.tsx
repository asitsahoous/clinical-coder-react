import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, ArrowUpDown, FileText, Activity, Target, TrendingUp } from 'lucide-react';
import { useCaseStore } from '@/stores/case-store';
import type { DRGCaseSummary, DRGSignal, CCMCCClassification, RankedDiagnosis } from '@/types/icd10';

// ---- Sub-components ----

function SignalBadge({ signal }: { signal: DRGSignal }) {
  const colors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[signal.severity]}`}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} />
        <span className="font-semibold text-sm uppercase">{signal.type.replace(/_/g, ' ')}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-bold
          ${signal.severity === 'high' ? 'bg-red-200' : signal.severity === 'medium' ? 'bg-yellow-200' : 'bg-blue-200'}`}>
          {signal.severity.toUpperCase()}
        </span>
      </div>
      <p className="text-sm">{signal.message}</p>
      {signal.evidence && <p className="text-xs mt-1 opacity-75">Evidence: {signal.evidence}</p>}
    </div>
  );
}

function PrincipalDxPanel({ candidates }: { candidates: RankedDiagnosis[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <Target size={20} className="text-blue-600" />
        Principal Diagnosis Candidates
      </h3>
      <div className="space-y-2">
        {candidates.map((c, i) => (
          <div key={c.code} className={`flex items-start gap-3 p-3 rounded-lg border
            ${i === 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
              ${i === 0 ? 'bg-blue-600 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200'}`}>
              #{i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-blue-600">{c.code}</span>
                {c.isCurrentPrincipal && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Current PDx</span>
                )}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{c.description}</p>
              <p className="text-xs text-gray-500 mt-1">{c.reasoning}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CCMCCPanel({ classifications }: { classifications: CCMCCClassification[] }) {
  const mccCodes = classifications.filter(c => c.ccLevel === 'MCC');
  const ccCodes = classifications.filter(c => c.ccLevel === 'CC');
  const nonCC = classifications.filter(c => c.ccLevel === 'none');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <Activity size={20} className="text-purple-600" />
        CC/MCC Classification
        <span className="ml-auto text-sm font-normal text-gray-500">
          {mccCodes.length} MCC · {ccCodes.length} CC · {nonCC.length} None
        </span>
      </h3>

      {mccCodes.length > 0 && (
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-red-700 mb-1">Major CC (MCC)</h4>
          {mccCodes.map(c => (
            <div key={c.code} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded mb-1">
              <span className="text-xs font-bold bg-red-200 text-red-800 px-2 py-0.5 rounded">MCC</span>
              <span className="font-mono text-sm">{c.code}</span>
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{c.description}</span>
              {c.supported ? <CheckCircle size={14} className="text-green-600 ml-auto flex-shrink-0" /> :
                <AlertTriangle size={14} className="text-yellow-600 ml-auto flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {ccCodes.length > 0 && (
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-orange-700 mb-1">Complication/Comorbidity (CC)</h4>
          {ccCodes.map(c => (
            <div key={c.code} className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded mb-1">
              <span className="text-xs font-bold bg-orange-200 text-orange-800 px-2 py-0.5 rounded">CC</span>
              <span className="font-mono text-sm">{c.code}</span>
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{c.description}</span>
              {c.supported ? <CheckCircle size={14} className="text-green-600 ml-auto flex-shrink-0" /> :
                <AlertTriangle size={14} className="text-yellow-600 ml-auto flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {nonCC.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 mb-1">Non-CC ({nonCC.length})</h4>
          <div className="text-sm text-gray-500">
            {nonCC.slice(0, 5).map(c => (
              <div key={c.code} className="flex items-center gap-2 py-1">
                <span className="font-mono">{c.code}</span>
                <span className="truncate">{c.description}</span>
              </div>
            ))}
            {nonCC.length > 5 && <p className="text-xs text-gray-400 mt-1">+ {nonCC.length - 5} more</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----

export default function DRGValidationPage() {
  const { cases, activeCaseId } = useCaseStore();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(activeCaseId);

  const activeCase = cases.find(c => c.id === selectedCaseId);
  const drgSummary = activeCase?.drgSummary;

  // Cases with DRG analysis
  const casesWithDRG = cases.filter(c => c.drgSummary);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-bold">DRG Validation</h1>
            <p className="text-sm text-gray-500">Principal Dx Ranking · CC/MCC Analysis · High-Value Signals</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Case List */}
        <div className="w-72 border-r overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="p-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Cases ({casesWithDRG.length})</h3>
            {casesWithDRG.length === 0 && (
              <div className="text-sm text-gray-400 p-4 text-center">
                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                <p>No cases with DRG analysis yet.</p>
                <p className="text-xs mt-1">Run analysis from the Coding Workspace to see DRG validation here.</p>
              </div>
            )}
            {casesWithDRG.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCaseId(c.id)}
                className={`w-full text-left p-3 rounded-lg mb-1 border transition-colors
                  ${selectedCaseId === c.id ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200' : 'bg-white dark:bg-gray-800 border-transparent hover:border-gray-200'}`}
              >
                <div className="text-sm font-semibold truncate">{c.caseNumber}</div>
                <div className="text-xs text-gray-500">{c.patientInfo?.encounterType || 'Unknown'}</div>
                {c.drgSummary && (
                  <div className="flex gap-1 mt-1">
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 rounded">
                      {c.drgSummary.highValueSignals.filter(s => s.severity === 'high').length} high
                    </span>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 rounded">
                      {c.drgSummary.highValueSignals.filter(s => s.severity === 'medium').length} med
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!drgSummary ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Shield size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg">Select a case to view DRG validation</p>
                <p className="text-sm mt-1">Cases are analyzed when coding is completed in the Workspace.</p>
              </div>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* High-Value Signals */}
              {drgSummary.highValueSignals.length > 0 && (
                <div>
                  <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <TrendingUp size={20} className="text-red-600" />
                    High-Value Review Signals ({drgSummary.highValueSignals.length})
                  </h2>
                  <div className="space-y-2">
                    {drgSummary.highValueSignals.map((signal, i) => (
                      <SignalBadge key={i} signal={signal} />
                    ))}
                  </div>
                </div>
              )}

              {/* Principal Dx */}
              <PrincipalDxPanel candidates={drgSummary.principalDxCandidates} />

              {/* CC/MCC */}
              <CCMCCPanel classifications={drgSummary.secondaryDxWithCCMCC} />

              {/* PCS Procedures */}
              {drgSummary.pcsCandidates.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <ArrowUpDown size={20} className="text-green-600" />
                    PCS Procedure Candidates ({drgSummary.pcsCandidates.length})
                  </h3>
                  <div className="space-y-2">
                    {drgSummary.pcsCandidates.map(p => (
                      <div key={p.code} className="flex items-center gap-3 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                        <span className="font-mono font-bold text-green-700">{p.code}</span>
                        <span className="text-sm flex-1">{p.description}</span>
                        <span className="text-xs text-gray-500">{Math.round(p.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
