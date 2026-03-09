import { useState, useEffect, useMemo } from 'react';
import { useCodeDatabase } from '@/stores/code-database-store';
import { Search, Filter, BookOpen, ChevronRight, ChevronDown, X, Database, AlertTriangle, Info, TreePine, List } from 'lucide-react';
import type { ICD10IndexEntry, ICD10CMDetail } from '@/types/icd10';
import { DataLoadingOverlay } from '@/components/common/LoadingSpinner';
import { CodeTree } from '@/components/code-browser/CodeTree';

type BrowseMode = 'search' | 'tree';

export function CodeBrowserPage() {
  const {
    cmIndex, pcsIndex, cmDetails, pcsTables,
    isLoading, loadProgress, searchQuery, searchResults,
    searchTaxonomy, setSearchQuery, setSearchTaxonomy, search
  } = useCodeDatabase();

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState<number | null>(null);
  const [showBillableOnly, setShowBillableOnly] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const [browseMode, setBrowseMode] = useState<BrowseMode>('search');
  const totalCodes = cmIndex.length + pcsIndex.length;

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => { search(inputValue); }, 200);
    return () => clearTimeout(timer);
  }, [inputValue, search]);

  // Get chapters for filter
  const chapters = useMemo(() => {
    const chapterMap = new Map<number, string>();
    cmIndex.forEach((e) => {
      if (e.chapter && !chapterMap.has(e.chapter)) {
        chapterMap.set(e.chapter, e.section || `Chapter ${e.chapter}`);
      }
    });
    return Array.from(chapterMap.entries()).sort((a, b) => a[0] - b[0]);
  }, [cmIndex]);

  // Filter results
  const displayResults = useMemo(() => {
    let results = searchQuery ? searchResults : [];
    if (showBillableOnly) results = results.filter((r) => r.billable);
    if (chapterFilter !== null) results = results.filter((r) => r.chapter === chapterFilter);
    return results;
  }, [searchResults, searchQuery, showBillableOnly, chapterFilter]);

  const detail = selectedCode ? cmDetails[selectedCode] : null;

  if (isLoading) return <DataLoadingOverlay progress={loadProgress} />;

  return (
    <div className="h-full flex flex-col gap-4 max-w-7xl mx-auto animate-fade-in">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <BookOpen size={22} className="text-primary-500" /> ICD-10 Code Browser
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Search across {totalCodes.toLocaleString()} ICD-10-CM and ICD-10-PCS codes
          </p>
        </div>

        {/* Browse Mode Toggle */}
        <div className="flex bg-surface-tertiary rounded-lg p-0.5">
          <button
            onClick={() => setBrowseMode('search')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              browseMode === 'search' ? 'bg-primary-600 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Search size={13} /> Search
          </button>
          <button
            onClick={() => setBrowseMode('tree')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              browseMode === 'tree' ? 'bg-primary-600 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <TreePine size={13} /> Drill-Down
          </button>
        </div>
      </div>

      {/* Search Mode */}
      {browseMode === 'search' && (
        <>
          {/* Search Bar */}
          <div className="card p-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Search by code (e.g., I25.10) or description (e.g., heart failure)..."
                  className="input-field pl-9 pr-9"
                  autoFocus
                />
                {inputValue && (
                  <button onClick={() => { setInputValue(''); setSearchQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Taxonomy toggle */}
              <div className="flex bg-surface-tertiary rounded-lg p-0.5">
                {(['all', 'ICD-10-CM', 'ICD-10-PCS'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSearchTaxonomy(t)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      searchTaxonomy === t ? 'bg-primary-600 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {t === 'all' ? 'All' : t.replace('ICD-10-', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBillableOnly}
                  onChange={(e) => setShowBillableOnly(e.target.checked)}
                  className="rounded border-border"
                />
                Billable only
              </label>

              {searchTaxonomy !== 'ICD-10-PCS' && (
                <select
                  value={chapterFilter ?? ''}
                  onChange={(e) => setChapterFilter(e.target.value ? Number(e.target.value) : null)}
                  className="input-field !w-auto text-xs !py-1"
                >
                  <option value="">All Chapters</option>
                  {chapters.map(([num]) => (
                    <option key={num} value={num}>Ch. {num}</option>
                  ))}
                </select>
              )}

              {searchQuery && (
                <span className="text-xs text-text-muted ml-auto">
                  <Database size={12} className="inline mr-1" />
                  {displayResults.length} results
                </span>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* Code List */}
            <div className="flex-1 card overflow-hidden flex flex-col">
              {!searchQuery ? (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div>
                    <Search size={40} className="text-text-muted mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-text-muted">Enter a code or description to search</p>
                    <p className="text-xs text-text-muted mt-1">
                      Try: "diabetes", "I25", "heart failure", "0BJ08ZZ"
                    </p>
                    <button
                      onClick={() => setBrowseMode('tree')}
                      className="mt-3 text-xs text-primary-600 hover:text-primary-700 underline flex items-center gap-1 mx-auto"
                    >
                      <TreePine size={12} /> Or use the hierarchical drill-down browser
                    </button>
                  </div>
                </div>
              ) : displayResults.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div>
                    <AlertTriangle size={32} className="text-text-muted mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-text-muted">No codes found for "{searchQuery}"</p>
                    <p className="text-xs text-text-muted mt-1">Try a different search term or adjust filters</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-tertiary sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-text-secondary">Code</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-text-secondary">Description</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-text-secondary">Type</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-text-secondary">Billable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayResults.map((entry) => (
                        <tr
                          key={`${entry.taxonomy}-${entry.code}`}
                          onClick={() => setSelectedCode(entry.code)}
                          className={`cursor-pointer transition-colors ${
                            selectedCode === entry.code ? 'bg-primary-50' : 'hover:bg-surface-tertiary'
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-primary-700 whitespace-nowrap">
                            {entry.code}
                          </td>
                          <td className="px-3 py-2 text-xs text-text-primary">{entry.desc}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              entry.taxonomy === 'ICD-10-CM' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {entry.taxonomy === 'ICD-10-CM' ? 'CM' : 'PCS'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {entry.billable ? (
                              <span className="text-emerald-600 text-xs">&#10003;</span>
                            ) : (
                              <span className="text-text-muted text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Detail Panel */}
            {selectedCode && (
              <div className="w-80 lg:w-96 card overflow-auto p-4 animate-slide-in">
                <CodeDetailPanel code={selectedCode} detail={detail} onClose={() => setSelectedCode(null)} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Tree (Drill-Down) Mode */}
      {browseMode === 'tree' && (
        <div className="flex-1 card overflow-hidden min-h-0">
          <CodeTree onSelectCode={(code) => setSelectedCode(code)} />
        </div>
      )}
    </div>
  );
}

function CodeDetailPanel({ code, detail, onClose }: { code: string; detail: ICD10CMDetail | null; onClose: () => void }) {
  const pcsIndex = useCodeDatabase((s) => s.pcsIndex);
  const pcsEntry = pcsIndex.find((e) => e.code === code);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold font-mono text-primary-700">{code}</h3>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            detail ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {detail ? 'ICD-10-CM' : 'ICD-10-PCS'}
          </span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
      </div>

      {detail ? (
        <>
          <div>
            <p className="text-sm font-medium text-text-primary">{detail.desc}</p>
            <p className="text-xs text-text-muted mt-1">
              Chapter {detail.chapter}: {detail.chapterDesc}
            </p>
            <p className="text-xs text-text-muted">Section: {detail.sectionDesc}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              detail.billable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              {detail.billable ? '✓ Billable' : '✗ Non-billable (category)'}
            </span>
          </div>

          {/* RED FLAG for non-billable */}
          {!detail.billable && detail.children.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 text-red-700 text-xs font-bold mb-1">
                <AlertTriangle size={12} /> RED FLAG
              </div>
              <p className="text-xs text-red-600">
                Category code — {detail.children.length} more specific code(s) available. Must use the most specific billable code.
              </p>
            </div>
          )}

          {detail.parent && (
            <div className="text-xs text-text-muted">
              Parent: <span className="font-mono font-semibold text-primary-600">{detail.parent}</span>
            </div>
          )}

          {detail.children.length > 0 && (
            <DetailSection title="Child Codes" items={detail.children.map((c) => `${c}`)} mono />
          )}

          {detail.includes.length > 0 && (
            <DetailSection title="Includes" items={detail.includes} color="blue" />
          )}

          {detail.excludes1.length > 0 && (
            <DetailSection title="Excludes1 (NOT coded here)" items={detail.excludes1} color="red" />
          )}

          {detail.excludes2.length > 0 && (
            <DetailSection title="Excludes2 (May use together)" items={detail.excludes2} color="amber" />
          )}

          {detail.codeFirst && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800">Code First</p>
              <p className="text-xs text-amber-700 mt-1">{detail.codeFirst}</p>
            </div>
          )}

          {detail.useAdditionalCode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800">Use Additional Code</p>
              <p className="text-xs text-blue-700 mt-1">{detail.useAdditionalCode}</p>
            </div>
          )}

          {detail.codeAlso && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-800">Code Also</p>
              <p className="text-xs text-purple-700 mt-1">{detail.codeAlso}</p>
            </div>
          )}

          {/* 7th Character */}
          {detail.sevenChrDef && Object.keys(detail.sevenChrDef).length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-800 mb-1">7th Character Extensions</p>
              {Object.entries(detail.sevenChrDef).map(([chr, desc]) => (
                <p key={chr} className="text-xs text-purple-700">
                  <span className="font-mono font-bold">{chr}</span> — {desc}
                </p>
              ))}
            </div>
          )}
        </>
      ) : pcsEntry ? (
        <>
          <p className="text-sm font-medium text-text-primary">{pcsEntry.desc}</p>
          <div className="space-y-2">
            <p className="text-xs text-text-muted">Section: {pcsEntry.pcsSection}</p>
            <p className="text-xs text-text-muted">Body System: {pcsEntry.bodySystem}</p>
            <p className="text-xs text-text-muted">Operation: {pcsEntry.operation}</p>
          </div>
          {/* PCS code breakdown */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-purple-800 mb-2">7-Character Breakdown</p>
            <div className="flex gap-0.5">
              {code.split('').map((char, i) => (
                <div key={i} className="flex flex-col items-center">
                  <span className="w-7 h-7 bg-purple-200 rounded flex items-center justify-center font-mono text-sm font-bold text-purple-800">
                    {char}
                  </span>
                  <span className="text-[9px] text-purple-600 mt-0.5">Pos {i + 1}</span>
                </div>
              ))}
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Billable</span>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Info size={14} />
          <span>No additional details available for this code.</span>
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, items, color = 'slate', mono = false }: {
  title: string; items: string[]; color?: string; mono?: boolean;
}) {
  const [expanded, setExpanded] = useState(items.length <= 5);

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text-primary w-full">
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title} ({items.length})
      </button>
      {expanded && (
        <ul className="mt-1.5 space-y-1 pl-4">
          {items.map((item, i) => (
            <li key={i} className={`text-xs text-${color}-700 ${mono ? 'font-mono font-semibold' : ''}`}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
