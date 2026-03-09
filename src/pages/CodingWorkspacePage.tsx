import { useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useCodeDatabase } from '@/stores/code-database-store';
import { analyzeWithCMS2Step, SAMPLE_SUMMARIES } from '@/engines/keyword-engine';
import type { AnalysisResult } from '@/engines/keyword-engine';
import { ConfidenceBadge, TierBadge } from '@/components/common/ConfidenceBadge';
import { RedFlagAlert } from '@/components/common/RedFlagAlert';
import type { CodingResult, CodingSession, PatientInfo, ConfidenceTier, AnalysisMode, CrossValidationResult, DocumentStructure } from '@/types/icd10';
import {
  FileCode, Play, RotateCcw, Download, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle, FileText, User, Calendar, Zap, Brain, Layers,
  ArrowUpDown, Filter, Eye, Clipboard, ShieldCheck, BookOpen, ArrowRight,
  AlertCircle, Info, Search, ListChecks
} from 'lucide-react';

export function CodingWorkspacePage() {
  const { analysisMode, setAnalysisMode, addSession } = useAppStore();
  const { cmIndex, pcsIndex, cmDetails } = useCodeDatabase();
  const [text, setText] = useState('');
  const [results, setResults] = useState<CodingResult[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<ConfidenceTier | null>(null);
  const [sortBy, setSortBy] = useState<'confidence' | 'code' | 'sequence'>('sequence');
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({});
  const [showPatientInfo, setShowPatientInfo] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [showDocStructure, setShowDocStructure] = useState(false);
  const [showCrossValidation, setShowCrossValidation] = useState(false);

  const allCodes = [...cmIndex, ...pcsIndex];

  const handleAnalyze = useCallback(async () => {
    if (!text.trim() || allCodes.length === 0) return;
    setIsAnalyzing(true);
    setResults([]);
    setAnalysisResult(null);

    // Use setTimeout to let UI update
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      // Use the new CMS 2-Step engine
      const result = analyzeWithCMS2Step(text, allCodes, cmDetails, {
        maxResults: 50,
        minConfidence: 0.3,
        billableOnly: true,
      });

      setResults(result.results);
      setAnalysisResult(result);

      // Save session
      const session: CodingSession = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        patientInfo,
        dischargeSummary: text,
        results: result.results,
        status: result.results.length > 0 && result.results[0].tier <= 2 ? 'pending_review' : 'draft',
        overallConfidence: result.results.length > 0
          ? result.results.reduce((sum, r) => sum + r.confidence, 0) / result.results.length
          : 0,
        overallTier: result.results.length > 0 ? result.results[0].tier : 4,
      };
      addSession(session);
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [text, allCodes, cmDetails, patientInfo, addSession]);

  const handleReset = () => {
    setText('');
    setResults([]);
    setAnalysisResult(null);
    setExpandedCode(null);
    setPatientInfo({});
    setShowDocStructure(false);
    setShowCrossValidation(false);
  };

  const handleExport = () => {
    if (results.length === 0) return;
    const csv = [
      'Sequence,Code,Description,Taxonomy,Confidence,Tier,Source,Completeness,Red Flags,Reasoning',
      ...results.map((r) =>
        [
          r.sequenceOrder, r.code, `"${r.description}"`, r.taxonomy,
          `${Math.round(r.confidence * 100)}%`, `Tier ${r.tier}`, r.source,
          r.completenessResult ? `${r.completenessResult.passedCount}/${r.completenessResult.totalChecks}` : 'N/A',
          r.redFlags.length > 0 ? `"${r.redFlags.map(f => f.message).join('; ')}"` : 'None',
          r.reasoning ? `"${r.reasoning.substring(0, 200)}"` : '',
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coding-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter and sort results
  const displayResults = results
    .filter((r) => filterTier === null || r.tier === filterTier)
    .sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'code') return a.code.localeCompare(b.code);
      return a.sequenceOrder - b.sequenceOrder;
    });

  const totalRedFlags = results.reduce((sum, r) => sum + r.redFlags.length, 0);

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 max-w-7xl mx-auto animate-fade-in">
      {/* Left: Input Panel */}
      <div className="lg:w-1/2 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <FileCode size={22} className="text-primary-500" /> Coding Workspace
          </h1>
        </div>

        {/* CMS 2-Step Methodology Badge */}
        <div className="card p-3 bg-gradient-to-r from-primary-50 to-blue-50 border-primary-200">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck size={16} className="text-primary-600" />
            <div>
              <span className="font-bold text-primary-800">CMS 2-Step Coding Methodology</span>
              <p className="text-primary-600 mt-0.5">
                Step 1: Alphabetic Index Lookup → Step 2: Tabular List Verification → 8 Completeness Checks
              </p>
            </div>
          </div>
        </div>

        {/* Patient Info (collapsible) */}
        <div className="card">
          <button
            onClick={() => setShowPatientInfo(!showPatientInfo)}
            className="w-full flex items-center gap-2 p-3 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            {showPatientInfo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <User size={14} /> Patient Information (Optional)
          </button>
          {showPatientInfo && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted">Age</label>
                <input
                  type="number"
                  value={patientInfo.age || ''}
                  onChange={(e) => setPatientInfo({ ...patientInfo, age: Number(e.target.value) || undefined })}
                  placeholder="e.g., 72"
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted">Gender</label>
                <select
                  value={patientInfo.gender || ''}
                  onChange={(e) => setPatientInfo({ ...patientInfo, gender: (e.target.value as 'M' | 'F') || undefined })}
                  className="input-field text-sm"
                >
                  <option value="">Select</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted">Encounter Type</label>
                <select
                  value={patientInfo.encounterType || ''}
                  onChange={(e) => setPatientInfo({ ...patientInfo, encounterType: (e.target.value as 'inpatient' | 'outpatient' | 'emergency') || undefined })}
                  className="input-field text-sm"
                >
                  <option value="">Select</option>
                  <option value="inpatient">Inpatient</option>
                  <option value="outpatient">Outpatient</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted">Admission Date</label>
                <input
                  type="date"
                  value={patientInfo.admissionDate || ''}
                  onChange={(e) => setPatientInfo({ ...patientInfo, admissionDate: e.target.value })}
                  className="input-field text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Text Input */}
        <div className="card flex-1 flex flex-col min-h-[300px]">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="text-xs font-semibold text-text-secondary flex items-center gap-1">
              <FileText size={14} /> Discharge Summary
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSamples(!showSamples)}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Clipboard size={12} /> Samples
              </button>
              {text && (
                <span className="text-[10px] text-text-muted">
                  {text.split(/\s+/).length} words
                </span>
              )}
            </div>
          </div>

          {showSamples && (
            <div className="p-2 border-b border-border bg-surface-tertiary space-y-1">
              {SAMPLE_SUMMARIES.map((sample, i) => (
                <button
                  key={i}
                  onClick={() => { setText(sample.text); setShowSamples(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  <span className="font-medium">{sample.title}</span>
                  <span className="text-text-muted ml-2">{sample.text.substring(0, 60)}...</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type the discharge summary, clinical notes, or medical documentation here...

The CMS 2-Step engine will:
  1. Read the entire document holistically
  2. Extract principal & secondary diagnoses
  3. Look up each condition in the Alphabetic Index (Step 1)
  4. Verify each code in the Tabular List (Step 2)
  5. Run 8 completeness checks on each code
  6. Cross-validate all codes against each other"
            className="flex-1 p-4 text-sm text-text-primary bg-transparent resize-none focus:outline-none placeholder-text-muted/50 font-mono leading-relaxed"
          />

          {/* Action buttons */}
          <div className="flex items-center gap-2 p-3 border-t border-border">
            <button
              onClick={handleAnalyze}
              disabled={!text.trim() || isAnalyzing || allCodes.length === 0}
              className={`btn-primary flex items-center gap-2 ${
                isAnalyzing ? 'opacity-50 cursor-wait' : ''
              } ${!text.trim() ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              <Play size={14} />
              {isAnalyzing ? 'Analyzing...' : 'Analyze (CMS 2-Step)'}
            </button>
            <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
              <RotateCcw size={14} /> Reset
            </button>
            {results.length > 0 && (
              <button onClick={handleExport} className="btn-secondary flex items-center gap-2 ml-auto">
                <Download size={14} /> Export CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: Results Panel */}
      <div className="lg:w-1/2 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">
            Results {results.length > 0 && `(${results.length})`}
          </h2>
          {results.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="input-field !w-auto text-xs !py-1"
              >
                <option value="sequence">Sort: Sequence</option>
                <option value="confidence">Sort: Confidence</option>
                <option value="code">Sort: Code</option>
              </select>
              {/* Tier filter */}
              <select
                value={filterTier ?? ''}
                onChange={(e) => setFilterTier(e.target.value ? (Number(e.target.value) as ConfidenceTier) : null)}
                className="input-field !w-auto text-xs !py-1"
              >
                <option value="">All Tiers</option>
                <option value="1">Tier 1 (Auto)</option>
                <option value="2">Tier 2 (Light)</option>
                <option value="3">Tier 3 (Full)</option>
                <option value="4">Tier 4 (Expert)</option>
              </select>
            </div>
          )}
        </div>

        {/* Document Structure Panel (Phase A result) */}
        {analysisResult?.documentStructure && (
          <DocumentStructurePanel
            structure={analysisResult.documentStructure}
            isExpanded={showDocStructure}
            onToggle={() => setShowDocStructure(!showDocStructure)}
          />
        )}

        {/* Cross-Validation Panel (Phase C result) */}
        {analysisResult?.crossValidation && (
          <CrossValidationPanel
            validation={analysisResult.crossValidation}
            isExpanded={showCrossValidation}
            onToggle={() => setShowCrossValidation(!showCrossValidation)}
          />
        )}

        {/* Summary bar */}
        {results.length > 0 && (
          <div className="card p-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-text-secondary">
                <strong>{results.filter((r) => r.tier <= 2).length}</strong> high confidence
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <AlertTriangle size={14} className="text-amber-500" />
              <span className="text-text-secondary">
                <strong>{totalRedFlags}</strong> red flags
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <ListChecks size={14} className="text-blue-500" />
              <span className="text-text-secondary">
                <strong>{results.filter((r) => r.completenessResult?.allPassed).length}</strong>/{results.length} fully complete
              </span>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              {[1, 2, 3, 4].map((t) => {
                const count = results.filter((r) => r.tier === t).length;
                return count > 0 ? (
                  <span key={t} className={`tier-badge tier-${t} text-[10px]`}>
                    T{t}: {count}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Results list */}
        <div className="flex-1 overflow-auto space-y-2">
          {isAnalyzing ? (
            <div className="card p-8 text-center">
              <div className="animate-pulse-ring w-12 h-12 rounded-full bg-primary-100 mx-auto mb-4 flex items-center justify-center">
                <ShieldCheck size={20} className="text-primary-600" />
              </div>
              <p className="text-sm font-medium text-text-primary">Analyzing with CMS 2-Step Methodology...</p>
              <p className="text-xs text-text-muted mt-1">
                Phase A: Holistic Document Read → Phase B: Condition-by-Condition Coding → Phase C: Cross-Validation
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="card p-8 text-center">
              <FileCode size={40} className="text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-sm text-text-muted">
                {text ? 'Click "Analyze" to process with CMS 2-Step methodology' : 'Enter a discharge summary to begin'}
              </p>
            </div>
          ) : (
            displayResults.map((result) => (
              <ResultCard
                key={result.code}
                result={result}
                isExpanded={expandedCode === result.code}
                onToggle={() => setExpandedCode(expandedCode === result.code ? null : result.code)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Document Structure Panel (Phase A)
// ============================================================================

function DocumentStructurePanel({ structure, isExpanded, onToggle }: {
  structure: DocumentStructure; isExpanded: boolean; onToggle: () => void;
}) {
  return (
    <div className="card">
      <button onClick={onToggle} className="w-full flex items-center gap-2 p-3 text-left">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BookOpen size={14} className="text-primary-500" />
        <span className="text-xs font-bold text-text-primary">Phase A: Document Structure (Holistic Read)</span>
        <span className="text-[10px] text-text-muted ml-auto">
          {structure.principalDiagnosis ? '1 PDx' : '0 PDx'} + {structure.secondaryDiagnoses.length} SDx + {structure.procedures.length} Proc
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Demographics */}
          <div className="grid grid-cols-4 gap-2">
            {structure.patientAge && (
              <div className="bg-surface-tertiary rounded-lg p-2 text-center">
                <p className="text-[10px] text-text-muted">Age</p>
                <p className="text-sm font-bold text-text-primary">{structure.patientAge}</p>
              </div>
            )}
            {structure.patientGender && (
              <div className="bg-surface-tertiary rounded-lg p-2 text-center">
                <p className="text-[10px] text-text-muted">Gender</p>
                <p className="text-sm font-bold text-text-primary">{structure.patientGender === 'M' ? 'Male' : 'Female'}</p>
              </div>
            )}
            {structure.encounterContext !== 'unknown' && (
              <div className="bg-surface-tertiary rounded-lg p-2 text-center">
                <p className="text-[10px] text-text-muted">Encounter</p>
                <p className="text-sm font-bold text-text-primary capitalize">{structure.encounterContext}</p>
              </div>
            )}
            {structure.sections.length > 0 && (
              <div className="bg-surface-tertiary rounded-lg p-2 text-center">
                <p className="text-[10px] text-text-muted">Sections</p>
                <p className="text-sm font-bold text-text-primary">{structure.sections.length}</p>
              </div>
            )}
          </div>

          {/* Principal Diagnosis */}
          {structure.principalDiagnosis && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-primary-800 mb-0.5">PRINCIPAL DIAGNOSIS:</p>
              <p className="text-xs text-primary-700">{structure.principalDiagnosis.rawText}</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {structure.principalDiagnosis.isAcute && <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold">ACUTE</span>}
                {structure.principalDiagnosis.laterality && <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold">{structure.principalDiagnosis.laterality.toUpperCase()}</span>}
                {structure.principalDiagnosis.bodyPart && <span className="px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-bold">{structure.principalDiagnosis.bodyPart}</span>}
              </div>
            </div>
          )}

          {/* Secondary Diagnoses */}
          {structure.secondaryDiagnoses.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-text-secondary mb-1">SECONDARY DIAGNOSES ({structure.secondaryDiagnoses.length}):</p>
              <div className="space-y-1">
                {structure.secondaryDiagnoses.map((dx, i) => (
                  <div key={i} className="text-xs text-text-primary bg-surface-tertiary rounded p-1.5 flex items-center gap-1">
                    <span className="text-text-muted shrink-0">{i + 1}.</span>
                    <span className="truncate">{dx.rawText}</span>
                    {dx.isAcute && <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold shrink-0">ACUTE</span>}
                    {dx.laterality && <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold shrink-0">{dx.laterality.toUpperCase()}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lab Results */}
          {structure.labResults.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-text-secondary mb-1">LAB RESULTS:</p>
              <div className="flex flex-wrap gap-1">
                {structure.labResults.map((lab, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">{lab}</span>
                ))}
              </div>
            </div>
          )}

          {/* Medications */}
          {structure.medications.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-text-secondary mb-1">MEDICATIONS ({structure.medications.length}):</p>
              <p className="text-[10px] text-text-muted">{structure.medications.join(', ')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Cross-Validation Panel (Phase C)
// ============================================================================

function CrossValidationPanel({ validation, isExpanded, onToggle }: {
  validation: CrossValidationResult; isExpanded: boolean; onToggle: () => void;
}) {
  const hasIssues =
    validation.excludes1Conflicts.length > 0 ||
    validation.missingSequencing.length > 0 ||
    validation.missingExternalCause ||
    !validation.principalDxAppropriate ||
    validation.warnings.length > 0;

  const totalIssues =
    validation.excludes1Conflicts.length +
    validation.missingSequencing.length +
    (validation.missingExternalCause ? 1 : 0) +
    (!validation.principalDxAppropriate ? 1 : 0) +
    validation.warnings.length;

  return (
    <div className={`card ${hasIssues ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-emerald-400'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 p-3 text-left">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {hasIssues ? (
          <AlertTriangle size={14} className="text-amber-500" />
        ) : (
          <CheckCircle size={14} className="text-emerald-500" />
        )}
        <span className="text-xs font-bold text-text-primary">Phase C: Cross-Validation</span>
        <span className={`text-[10px] ml-auto font-bold ${hasIssues ? 'text-amber-600' : 'text-emerald-600'}`}>
          {hasIssues ? `${totalIssues} issue(s)` : 'All checks passed ✓'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
          {/* Excludes1 Conflicts */}
          {validation.excludes1Conflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
              <p className="text-xs font-bold text-red-800 flex items-center gap-1 mb-1">
                <AlertCircle size={12} /> Excludes1 Conflicts ({validation.excludes1Conflicts.length})
              </p>
              {validation.excludes1Conflicts.map((c, i) => (
                <p key={i} className="text-xs text-red-700 ml-4">• {c.message}</p>
              ))}
            </div>
          )}

          {/* Missing Sequencing */}
          {validation.missingSequencing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <p className="text-xs font-bold text-amber-800 flex items-center gap-1 mb-1">
                <AlertTriangle size={12} /> Sequencing Issues ({validation.missingSequencing.length})
              </p>
              {validation.missingSequencing.map((s, i) => (
                <p key={i} className="text-xs text-amber-700 ml-4">
                  • {s.code}: {s.type === 'code_first' ? 'Code First' : 'Use Additional'} — requires {s.requiresCode}
                </p>
              ))}
            </div>
          )}

          {/* Missing External Cause */}
          {validation.missingExternalCause && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle size={12} /> Injury codes present but no external cause code (V00-Y99) assigned
              </p>
            </div>
          )}

          {/* Principal Dx Issue */}
          {!validation.principalDxAppropriate && validation.principalDxIssue && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
              <p className="text-xs text-red-700 flex items-center gap-1">
                <AlertCircle size={12} /> Principal Dx: {validation.principalDxIssue}
              </p>
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.map((w, i) => (
            <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <Info size={12} /> {w}
              </p>
            </div>
          ))}

          {!hasIssues && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-center">
              <p className="text-xs text-emerald-700 flex items-center gap-1 justify-center">
                <CheckCircle size={12} /> All cross-validation checks passed — no conflicts detected
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Result Card (Enhanced with CMS reasoning)
// ============================================================================

function ResultCard({ result, isExpanded, onToggle }: {
  result: CodingResult; isExpanded: boolean; onToggle: () => void;
}) {
  const completeness = result.completenessResult;
  const reasoning = result.codingReasoning;

  return (
    <div className={`card transition-all ${
      result.redFlags.length > 0 ? 'border-l-4 border-l-amber-400' : ''
    } ${result.isPrincipalDx ? 'ring-2 ring-primary-200' : ''}`}>
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start gap-3">
          {/* Sequence number */}
          <div className="w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-text-muted">#{result.sequenceOrder}</span>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-primary-700">{result.code}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                result.taxonomy === 'ICD-10-CM' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {result.taxonomy === 'ICD-10-CM' ? 'CM' : 'PCS'}
              </span>
              {result.isPrincipalDx && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary-100 text-primary-700">
                  Principal Dx
                </span>
              )}
              {/* Completeness indicator */}
              {completeness && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5 ${
                  completeness.allPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <ListChecks size={9} />
                  {completeness.passedCount}/{completeness.totalChecks}
                </span>
              )}
            </div>
            <p className="text-xs text-text-primary mt-0.5 truncate">{result.description}</p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 shrink-0">
            <RedFlagAlert flags={result.redFlags} compact />
            <ConfidenceBadge confidence={result.confidence} tier={result.tier} />
            <TierBadge tier={result.tier} />
            {isExpanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
          </div>
        </div>
      </div>

      {/* Expanded detail with full CMS reasoning */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border mt-0 animate-fade-in">
          <div className="pt-3 space-y-3">

            {/* CMS 2-Step Reasoning Trail */}
            {reasoning && (
              <div className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-primary-800 flex items-center gap-1">
                  <ShieldCheck size={13} /> CMS 2-Step Coding Reasoning
                </p>

                {/* Document Context */}
                <div className="text-xs text-primary-700">
                  <span className="font-semibold">Context:</span> {reasoning.documentContext}
                </div>

                {/* Step 1: Index Lookup */}
                <div className="bg-white/60 rounded-lg p-2">
                  <p className="text-[10px] font-bold text-primary-800 flex items-center gap-1 mb-1">
                    <Search size={10} /> Step 1: Alphabetic Index Lookup
                  </p>
                  <p className="text-xs text-primary-700">
                    Term: "<strong>{reasoning.indexLookup.clinicalTerm}</strong>"
                    → Main term: <strong>{reasoning.indexLookup.mainTerm}</strong>
                  </p>
                  {reasoning.indexLookup.subTerms.length > 0 && (
                    <p className="text-xs text-primary-600 mt-0.5">
                      Sub-terms: {reasoning.indexLookup.subTerms.join(' → ')}
                    </p>
                  )}
                  <p className="text-xs text-primary-600 mt-0.5">
                    Index code: <span className="font-mono font-bold">{reasoning.indexLookup.indexedCode}</span>
                  </p>
                </div>

                {/* Step 2: Tabular Verification */}
                <div className="bg-white/60 rounded-lg p-2">
                  <p className="text-[10px] font-bold text-primary-800 flex items-center gap-1 mb-1">
                    <BookOpen size={10} /> Step 2: Tabular List Verification
                  </p>
                  <p className="text-xs text-primary-700">
                    Verified: <span className="font-mono font-bold">{reasoning.tabularVerification.verifiedCode}</span>
                    {' '}(Chapter {reasoning.tabularVerification.chapterNumber}, Category {reasoning.tabularVerification.categoryCode})
                  </p>
                  {reasoning.tabularVerification.moreSpecificExists && (
                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={10} /> More specific codes exist
                    </p>
                  )}
                  {reasoning.tabularVerification.selectedOverAlternative && (
                    <p className="text-xs text-primary-600 mt-0.5">
                      Selected over {reasoning.tabularVerification.selectedOverAlternative.alternativeCode}: {reasoning.tabularVerification.selectedOverAlternative.reason}
                    </p>
                  )}
                  {reasoning.tabularVerification.instructionalNotes.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {reasoning.tabularVerification.instructionalNotes.slice(0, 3).map((note, i) => (
                        <p key={i} className="text-[10px] text-primary-600">📋 {note}</p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Coding Path */}
                <div className="text-xs text-primary-700">
                  <span className="font-semibold">Path:</span>{' '}
                  <span className="font-mono text-[10px]">{reasoning.codingPath}</span>
                </div>
              </div>
            )}

            {/* Completeness Checks (8 CMS checks) */}
            {completeness && (
              <div className={`rounded-lg p-3 border ${
                completeness.allPassed ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <p className={`text-xs font-bold mb-2 flex items-center gap-1 ${
                  completeness.allPassed ? 'text-emerald-800' : 'text-amber-800'
                }`}>
                  <ListChecks size={13} /> CMS Completeness Checks ({completeness.passedCount}/{completeness.totalChecks})
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {completeness.checks.map((check) => (
                    <div key={check.id} className="flex items-center gap-1.5 text-[10px]">
                      {check.passed ? (
                        <CheckCircle size={10} className="text-emerald-600 shrink-0" />
                      ) : check.severity === 'error' ? (
                        <AlertCircle size={10} className="text-red-600 shrink-0" />
                      ) : (
                        <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                      )}
                      <span className={`truncate ${
                        check.passed ? 'text-emerald-700' : check.severity === 'error' ? 'text-red-700' : 'text-amber-700'
                      }`} title={check.message}>
                        {check.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Show failed check details */}
                {completeness.checks.filter(c => !c.passed).map((check) => (
                  <div key={check.id} className="mt-2 p-2 bg-white/60 rounded text-[10px]">
                    <p className={`font-bold ${check.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                      {check.name}: {check.message}
                    </p>
                    {check.details && <p className="text-text-muted mt-0.5">{check.details}</p>}
                    {check.suggestedFix && <p className="text-primary-600 mt-0.5">💡 {check.suggestedFix}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Matched terms */}
            {result.matchedTerms.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-text-secondary mb-1">Matched Terms:</p>
                <div className="flex flex-wrap gap-1">
                  {result.matchedTerms.map((term, i) => (
                    <span key={i} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-[10px] font-medium">
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Red flags */}
            {result.redFlags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-text-secondary mb-1">Red Flags:</p>
                <RedFlagAlert flags={result.redFlags} />
              </div>
            )}

            {/* Extracted condition context */}
            {result.extractedCondition && (
              <div className="text-xs text-text-muted bg-surface-tertiary rounded-lg p-2">
                <p className="font-semibold text-text-secondary mb-0.5">Extracted from document:</p>
                <p>"{result.extractedCondition.rawText}"</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-[10px]">Section: {result.extractedCondition.sectionFound}</span>
                  {result.extractedCondition.isAcute && <span className="text-red-600">acute</span>}
                  {result.extractedCondition.laterality && <span className="text-blue-600">{result.extractedCondition.laterality}</span>}
                  {result.extractedCondition.bodyPart && <span className="text-purple-600">{result.extractedCondition.bodyPart}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
