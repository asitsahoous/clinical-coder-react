/**
 * CodeTree — Click-A-Dex Style Hierarchical Drill-Down Browser
 *
 * Allows users to navigate the ICD-10-CM hierarchy:
 *   Chapter → Section → Category → Subcategory → Billable Code
 *
 * RED FLAG indicators on non-billable (category-level) codes
 * Shows instructional notes (includes, excludes, code first, etc.) at each level
 */

import { useState, useMemo, useCallback } from 'react';
import { useCodeDatabase } from '@/stores/code-database-store';
import {
  ChevronRight, ChevronDown, AlertTriangle, CheckCircle, Info,
  FolderOpen, Folder, FileCode, ArrowRight, BookOpen, AlertCircle
} from 'lucide-react';
import type { ICD10CMDetail } from '@/types/icd10';

// ============================================================================
// Chapter Data — ICD-10-CM Chapter Structure
// ============================================================================

const ICD10_CHAPTERS = [
  { num: 1, range: 'A00-B99', title: 'Certain infectious and parasitic diseases', prefix: ['A', 'B'] },
  { num: 2, range: 'C00-D49', title: 'Neoplasms', prefix: ['C', 'D0', 'D1', 'D2', 'D3', 'D4'] },
  { num: 3, range: 'D50-D89', title: 'Diseases of blood and blood-forming organs', prefix: ['D5', 'D6', 'D7', 'D8'] },
  { num: 4, range: 'E00-E89', title: 'Endocrine, nutritional and metabolic diseases', prefix: ['E'] },
  { num: 5, range: 'F01-F99', title: 'Mental, behavioral and neurodevelopmental disorders', prefix: ['F'] },
  { num: 6, range: 'G00-G99', title: 'Diseases of the nervous system', prefix: ['G'] },
  { num: 7, range: 'H00-H59', title: 'Diseases of the eye and adnexa', prefix: ['H0', 'H1', 'H2', 'H3', 'H4', 'H5'] },
  { num: 8, range: 'H60-H95', title: 'Diseases of the ear and mastoid process', prefix: ['H6', 'H7', 'H8', 'H9'] },
  { num: 9, range: 'I00-I99', title: 'Diseases of the circulatory system', prefix: ['I'] },
  { num: 10, range: 'J00-J99', title: 'Diseases of the respiratory system', prefix: ['J'] },
  { num: 11, range: 'K00-K95', title: 'Diseases of the digestive system', prefix: ['K'] },
  { num: 12, range: 'L00-L99', title: 'Diseases of the skin and subcutaneous tissue', prefix: ['L'] },
  { num: 13, range: 'M00-M99', title: 'Diseases of the musculoskeletal system', prefix: ['M'] },
  { num: 14, range: 'N00-N99', title: 'Diseases of the genitourinary system', prefix: ['N'] },
  { num: 15, range: 'O00-O9A', title: 'Pregnancy, childbirth and the puerperium', prefix: ['O'] },
  { num: 16, range: 'P00-P96', title: 'Certain conditions originating in the perinatal period', prefix: ['P'] },
  { num: 17, range: 'Q00-Q99', title: 'Congenital malformations', prefix: ['Q'] },
  { num: 18, range: 'R00-R99', title: 'Symptoms, signs and abnormal clinical findings', prefix: ['R'] },
  { num: 19, range: 'S00-T88', title: 'Injury, poisoning and certain other consequences', prefix: ['S', 'T'] },
  { num: 20, range: 'V00-Y99', title: 'External causes of morbidity', prefix: ['V', 'W', 'X', 'Y'] },
  { num: 21, range: 'Z00-Z99', title: 'Factors influencing health status', prefix: ['Z'] },
  { num: 22, range: 'U00-U85', title: 'Codes for special purposes', prefix: ['U'] },
];

// ============================================================================
// Tree Node Component
// ============================================================================

interface TreeNodeProps {
  code: string;
  desc: string;
  detail?: ICD10CMDetail;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (code: string) => void;
  selectedCode: string | null;
  cmDetails: Record<string, ICD10CMDetail>;
}

function TreeNode({ code, desc, detail, level, isExpanded, onToggle, onSelect, selectedCode, cmDetails }: TreeNodeProps) {
  const hasChildren = detail ? detail.children.length > 0 : false;
  const isBillable = detail ? detail.billable : false;
  const isSelected = selectedCode === code;

  // RED FLAG: Non-billable (has more specific children)
  const isNonBillable = detail && !detail.billable && detail.children.length > 0;

  const indent = level * 20;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 cursor-pointer transition-colors rounded-md text-sm ${
          isSelected
            ? 'bg-primary-100 text-primary-800 border-l-3 border-l-primary-500'
            : 'hover:bg-surface-tertiary'
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => {
          onSelect(code);
          if (hasChildren) onToggle();
        }}
      >
        {/* Expand/Collapse Arrow */}
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="shrink-0 text-text-muted hover:text-text-primary">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {/* Icon */}
        {isBillable ? (
          <FileCode size={14} className="text-emerald-600 shrink-0" />
        ) : hasChildren ? (
          isExpanded ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <Folder size={14} className="text-amber-500 shrink-0" />
        ) : (
          <FileCode size={14} className="text-text-muted shrink-0" />
        )}

        {/* Code */}
        <span className={`font-mono text-xs font-bold shrink-0 ${isBillable ? 'text-emerald-700' : 'text-primary-600'}`}>
          {code}
        </span>

        {/* Description */}
        <span className="text-xs text-text-primary truncate flex-1">{desc}</span>

        {/* Status badges */}
        <div className="flex items-center gap-1 shrink-0">
          {isBillable && (
            <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold">
              BILLABLE
            </span>
          )}

          {isNonBillable && (
            <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-bold flex items-center gap-0.5" title="RED FLAG: Non-billable category code — must drill down further">
              <AlertTriangle size={9} /> CATEGORY
            </span>
          )}

          {detail?.codeFirst && (
            <span className="px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold" title="Code First instruction">
              CF
            </span>
          )}

          {detail?.useAdditionalCode && (
            <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-bold" title="Use Additional Code">
              UAC
            </span>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && detail && (
        <TreeChildren
          parentCode={code}
          childCodes={detail.children}
          level={level + 1}
          onSelect={onSelect}
          selectedCode={selectedCode}
          cmDetails={cmDetails}
        />
      )}
    </div>
  );
}

function TreeChildren({
  parentCode,
  childCodes,
  level,
  onSelect,
  selectedCode,
  cmDetails,
}: {
  parentCode: string;
  childCodes: string[];
  level: number;
  onSelect: (code: string) => void;
  selectedCode: string | null;
  cmDetails: Record<string, ICD10CMDetail>;
}) {
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  return (
    <div>
      {childCodes.map((childCode) => {
        const detail = cmDetails[childCode];
        return (
          <TreeNode
            key={childCode}
            code={childCode}
            desc={detail?.desc || childCode}
            detail={detail}
            level={level}
            isExpanded={expandedCodes.has(childCode)}
            onToggle={() => toggleExpand(childCode)}
            onSelect={onSelect}
            selectedCode={selectedCode}
            cmDetails={cmDetails}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Code Detail Side Panel (shown when a code is selected in the tree)
// ============================================================================

function CodeTreeDetailPanel({ code, detail, onClose }: { code: string; detail: ICD10CMDetail; onClose: () => void }) {
  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold font-mono text-primary-700">{code}</h3>
          <p className="text-sm text-text-primary mt-0.5">{detail.desc}</p>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          detail.billable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }`}>
          {detail.billable ? '✓ Billable' : '✗ Not Billable'}
        </span>
      </div>

      {/* Hierarchy Path */}
      <div className="bg-surface-tertiary rounded-lg p-2.5 text-xs">
        <p className="font-semibold text-text-secondary mb-1">Hierarchy Path:</p>
        <div className="flex items-center gap-1 flex-wrap text-text-muted">
          <span className="text-primary-600">Ch. {detail.chapter}</span>
          <ArrowRight size={10} />
          <span>{detail.sectionDesc}</span>
          <ArrowRight size={10} />
          <span className="font-mono font-bold text-primary-700">{code}</span>
        </div>
      </div>

      {/* Non-billable RED FLAG */}
      {!detail.billable && detail.children.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-red-700 text-xs font-bold mb-1">
            <AlertTriangle size={13} /> RED FLAG — Category Code
          </div>
          <p className="text-xs text-red-600">
            This code is NOT billable. You must drill down to a more specific child code.
            There are <strong>{detail.children.length}</strong> more specific code(s) available below.
          </p>
        </div>
      )}

      {/* Parent */}
      {detail.parent && (
        <div className="text-xs text-text-muted">
          Parent: <span className="font-mono font-semibold text-primary-600">{detail.parent}</span>
        </div>
      )}

      {/* Children count */}
      {detail.children.length > 0 && (
        <div className="text-xs text-text-muted flex items-center gap-1">
          <FolderOpen size={12} />
          {detail.children.length} child code(s): {detail.children.slice(0, 5).map(c => (
            <span key={c} className="font-mono text-primary-600">{c}</span>
          ))}
          {detail.children.length > 5 && <span>...</span>}
        </div>
      )}

      {/* 7th Character Definitions */}
      {detail.sevenChrDef && Object.keys(detail.sevenChrDef).length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-purple-800 mb-1 flex items-center gap-1">
            <Info size={12} /> 7th Character Extensions Required
          </p>
          <div className="space-y-0.5">
            {Object.entries(detail.sevenChrDef).map(([char, desc]) => (
              <p key={char} className="text-xs text-purple-700">
                <span className="font-mono font-bold bg-purple-200 px-1 rounded">{char}</span> — {desc}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Includes */}
      {detail.includes.length > 0 && (
        <NoteSection title="Includes" items={detail.includes} color="blue" icon={<CheckCircle size={12} />} />
      )}

      {/* Excludes1 */}
      {detail.excludes1.length > 0 && (
        <NoteSection title="Excludes1 — NOT coded here" items={detail.excludes1} color="red" icon={<AlertCircle size={12} />} />
      )}

      {/* Excludes2 */}
      {detail.excludes2.length > 0 && (
        <NoteSection title="Excludes2 — May use together" items={detail.excludes2} color="amber" icon={<Info size={12} />} />
      )}

      {/* Code First */}
      {detail.codeFirst && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
            <AlertTriangle size={12} /> Code First
          </p>
          <p className="text-xs text-amber-700 mt-0.5">{detail.codeFirst}</p>
        </div>
      )}

      {/* Use Additional Code */}
      {detail.useAdditionalCode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
            <Info size={12} /> Use Additional Code
          </p>
          <p className="text-xs text-blue-700 mt-0.5">{detail.useAdditionalCode}</p>
        </div>
      )}

      {/* Code Also */}
      {detail.codeAlso && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-purple-800 flex items-center gap-1">
            <BookOpen size={12} /> Code Also
          </p>
          <p className="text-xs text-purple-700 mt-0.5">{detail.codeAlso}</p>
        </div>
      )}
    </div>
  );
}

function NoteSection({ title, items, color, icon }: { title: string; items: string[]; color: string; icon: React.ReactNode }) {
  const [expanded, setExpanded] = useState(items.length <= 5);

  const colorClasses: Record<string, { bg: string; border: string; title: string; item: string }> = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-800', item: 'text-blue-700' },
    red: { bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-800', item: 'text-red-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', title: 'text-amber-800', item: 'text-amber-700' },
  };

  const cls = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`${cls.bg} border ${cls.border} rounded-lg p-2.5`}>
      <button onClick={() => setExpanded(!expanded)} className={`text-xs font-semibold ${cls.title} flex items-center gap-1 w-full`}>
        {icon} {title} ({items.length})
        {expanded ? <ChevronDown size={10} className="ml-auto" /> : <ChevronRight size={10} className="ml-auto" />}
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {items.map((item, i) => (
            <li key={i} className={`text-xs ${cls.item}`}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// Main CodeTree Component
// ============================================================================

export function CodeTree({ onSelectCode }: { onSelectCode?: (code: string) => void }) {
  const { cmDetails } = useCodeDatabase();
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // Build chapter → category mapping from cmDetails
  const chapterCategories = useMemo(() => {
    const result = new Map<number, string[]>();

    for (const [code, detail] of Object.entries(cmDetails)) {
      // Category codes are 3 characters (e.g., I21, E11)
      if (code.length === 3 && detail.chapter) {
        if (!result.has(detail.chapter)) result.set(detail.chapter, []);
        const arr = result.get(detail.chapter)!;
        if (!arr.includes(code)) arr.push(code);
      }
    }

    // Sort each chapter's categories
    for (const [, cats] of result) {
      cats.sort();
    }

    return result;
  }, [cmDetails]);

  const toggleChapter = useCallback((num: number) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((code: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const handleSelectCode = useCallback((code: string) => {
    setSelectedCode(code);
    onSelectCode?.(code);
  }, [onSelectCode]);

  const selectedDetail = selectedCode ? cmDetails[selectedCode] : null;

  return (
    <div className="flex h-full">
      {/* Tree Panel */}
      <div className="flex-1 overflow-auto">
        <div className="p-2">
          <h3 className="text-xs font-bold text-text-secondary mb-2 px-2 flex items-center gap-1.5">
            <BookOpen size={13} /> ICD-10-CM Hierarchy (Click-A-Dex)
          </h3>

          {/* Chapter list */}
          {ICD10_CHAPTERS.map((chapter) => {
            const isExpanded = expandedChapters.has(chapter.num);
            const categories = chapterCategories.get(chapter.num) || [];
            const catCount = categories.length;

            return (
              <div key={chapter.num} className="mb-0.5">
                {/* Chapter header */}
                <button
                  onClick={() => toggleChapter(chapter.num)}
                  className={`w-full flex items-center gap-2 py-2 px-2 rounded-lg text-left transition-colors ${
                    isExpanded ? 'bg-primary-50 text-primary-800' : 'hover:bg-surface-tertiary text-text-primary'
                  }`}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="text-xs font-bold text-primary-600 shrink-0">Ch. {chapter.num}</span>
                  <span className="text-xs font-medium truncate flex-1">{chapter.title}</span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {chapter.range} ({catCount})
                  </span>
                </button>

                {/* Categories under chapter */}
                {isExpanded && categories.length > 0 && (
                  <div className="ml-2 border-l-2 border-primary-100">
                    {categories.map((catCode) => {
                      const catDetail = cmDetails[catCode];
                      if (!catDetail) return null;

                      const isCatExpanded = expandedCategories.has(catCode);

                      return (
                        <div key={catCode}>
                          <TreeNode
                            code={catCode}
                            desc={catDetail.desc}
                            detail={catDetail}
                            level={1}
                            isExpanded={isCatExpanded}
                            onToggle={() => toggleCategory(catCode)}
                            onSelect={handleSelectCode}
                            selectedCode={selectedCode}
                            cmDetails={cmDetails}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedCode && selectedDetail && (
        <div className="w-80 border-l border-border overflow-auto bg-surface">
          <CodeTreeDetailPanel
            code={selectedCode}
            detail={selectedDetail}
            onClose={() => setSelectedCode(null)}
          />
        </div>
      )}
    </div>
  );
}
