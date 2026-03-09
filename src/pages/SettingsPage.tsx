import { useAppStore } from '@/stores/app-store';
import { useCodeDatabase } from '@/stores/code-database-store';
import { Settings, Key, Database, Palette, Info, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

export function SettingsPage() {
  const {
    openAIKey, anthropicKey, analysisMode, theme,
    setOpenAIKey, setAnthropicKey, setAnalysisMode, setTheme
  } = useAppStore();
  const { loadProgress, isLoading, loadAllData, cmIndex, pcsIndex, cmDetails, pcsTables, hcpcsIndex, hcpcsModifiers } = useCodeDatabase();

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={22} className="text-primary-500" /> Settings
        </h1>
        <p className="text-sm text-text-muted mt-0.5">Configure your Clinical Coder environment</p>
      </div>

      {/* AI API Keys */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Key size={16} /> AI Configuration
        </h2>
        <p className="text-xs text-text-muted">
          API keys are stored locally in your browser and never sent to our servers.
        </p>

        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">OpenAI API Key</label>
          <input
            type="password"
            value={openAIKey}
            onChange={(e) => setOpenAIKey(e.target.value)}
            placeholder="sk-..."
            className="input-field text-sm font-mono"
          />
          <p className="text-[10px] text-text-muted mt-1">Used for GPT-4o-mini powered code suggestions</p>
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Anthropic API Key</label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            className="input-field text-sm font-mono"
          />
          <p className="text-[10px] text-text-muted mt-1">Used for Claude-powered parameter extraction (primary AI)</p>
        </div>

        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Default Analysis Mode</label>
          <select
            value={analysisMode}
            onChange={(e) => setAnalysisMode(e.target.value as 'keyword' | 'ai' | 'hybrid')}
            className="input-field text-sm"
          >
            <option value="keyword">Keyword-Based (no API key needed)</option>
            <option value="ai">AI-Powered (requires API key)</option>
            <option value="hybrid">Hybrid (keyword + AI)</option>
          </select>
        </div>
      </div>

      {/* Database Status */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Database size={16} /> Code Database
          </h2>
          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Reload
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DataStatus
            label="ICD-10-CM Codes"
            count={cmIndex.length}
            loaded={loadProgress.cm}
          />
          <DataStatus
            label="ICD-10-PCS Codes"
            count={pcsIndex.length}
            loaded={loadProgress.pcs}
          />
          <DataStatus
            label="CM Details"
            count={Object.keys(cmDetails).length}
            loaded={loadProgress.details}
          />
          <DataStatus
            label="PCS Tables"
            count={pcsTables.length}
            loaded={loadProgress.tables}
          />
          <DataStatus
            label="HCPCS Level II"
            count={hcpcsIndex.length}
            loaded={loadProgress.hcpcs}
          />
          <DataStatus
            label="HCPCS Modifiers"
            count={hcpcsModifiers.length}
            loaded={loadProgress.hcpcs}
          />
        </div>

        <div className="bg-surface-tertiary rounded-lg p-3 text-xs text-text-muted space-y-1">
          <p>Total codes: <strong className="text-text-primary">{(cmIndex.length + pcsIndex.length + hcpcsIndex.length).toLocaleString()}</strong></p>
          <p className="text-[10px]">
            ICD-10-CM: {cmIndex.length.toLocaleString()} · ICD-10-PCS: {pcsIndex.length.toLocaleString()} · HCPCS: {hcpcsIndex.length.toLocaleString()}
          </p>
          <p>Data version: <strong className="text-text-primary">ICD-10 FY2026 + HCPCS 2026</strong></p>
          <p>Source: <strong className="text-text-primary">CMS Official Release</strong></p>
          <p className="text-[10px] text-text-muted/60 mt-1">
            CPT codes (AMA copyright) not displayed. CDT and NDC placeholders for future integration.
          </p>
        </div>
      </div>

      {/* Appearance */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Palette size={16} /> Appearance
        </h2>

        <div>
          <label className="text-xs font-medium text-text-secondary block mb-1">Theme</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
            className="input-field text-sm"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      {/* About */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Info size={16} /> About
        </h2>
        <div className="text-xs text-text-muted space-y-1">
          <p><strong>Clinical Coder v2.0</strong></p>
          <p>ICD-10-CM/PCS Code Assignment Tool</p>
          <p>Data: 2026 Official CMS Release</p>
          <p>Architecture: V3 Parameter Extraction</p>
          <p className="mt-2 text-[10px] text-text-muted/60">
            This tool is designed to assist clinical coders. All code assignments should be
            reviewed by qualified medical coding professionals. Not a substitute for professional
            medical coding judgment.
          </p>
        </div>
      </div>
    </div>
  );
}

function DataStatus({ label, count, loaded }: { label: string; count: number; loaded: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-tertiary">
      {loaded ? (
        <CheckCircle size={14} className="text-emerald-500 shrink-0" />
      ) : (
        <XCircle size={14} className="text-red-400 shrink-0" />
      )}
      <div>
        <p className="text-xs font-medium text-text-primary">{label}</p>
        <p className="text-[10px] text-text-muted">{count.toLocaleString()} loaded</p>
      </div>
    </div>
  );
}
