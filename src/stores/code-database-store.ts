import { create } from 'zustand';
import type { ICD10IndexEntry, ICD10CMDetail, PCSTableEntry, HCPCSCode, HCPCSModifier } from '@/types/icd10';

type SearchTaxonomy = 'all' | 'ICD-10-CM' | 'ICD-10-PCS' | 'HCPCS';

interface CodeDatabaseState {
  // Data
  cmIndex: ICD10IndexEntry[];
  pcsIndex: ICD10IndexEntry[];
  cmDetails: Record<string, ICD10CMDetail>;
  pcsTables: PCSTableEntry[];
  hcpcsIndex: HCPCSCode[];
  hcpcsModifiers: HCPCSModifier[];

  // Loading state
  isLoading: boolean;
  loadError: string | null;
  loadProgress: { cm: boolean; pcs: boolean; details: boolean; tables: boolean; hcpcs: boolean };

  // Search
  searchQuery: string;
  searchResults: ICD10IndexEntry[];
  hcpcsSearchResults: HCPCSCode[];
  searchTaxonomy: SearchTaxonomy;

  // Actions
  loadAllData: () => Promise<void>;
  search: (query: string, taxonomy?: SearchTaxonomy) => void;
  searchHCPCS: (query: string) => HCPCSCode[];
  setSearchQuery: (query: string) => void;
  setSearchTaxonomy: (taxonomy: SearchTaxonomy) => void;
  getCodeDetail: (code: string) => ICD10CMDetail | undefined;
  getHCPCSCode: (code: string) => HCPCSCode | undefined;
  getTotalCodeCount: () => number;
}

export const useCodeDatabase = create<CodeDatabaseState>()((set, get) => ({
  cmIndex: [],
  pcsIndex: [],
  cmDetails: {},
  pcsTables: [],
  hcpcsIndex: [],
  hcpcsModifiers: [],
  isLoading: false,
  loadError: null,
  loadProgress: { cm: false, pcs: false, details: false, tables: false, hcpcs: false },
  searchQuery: '',
  searchResults: [],
  hcpcsSearchResults: [],
  searchTaxonomy: 'all',

  loadAllData: async () => {
    set({ isLoading: true, loadError: null });
    try {
      // Load all data files in parallel (including HCPCS)
      const [cmIndexRes, pcsIndexRes, cmDetailsRes, pcsTablesRes, hcpcsRes, hcpcsModRes] = await Promise.allSettled([
        fetch('/data/icd10cm-index.json').then((r) => r.ok ? r.json() : Promise.reject('CM index not found')),
        fetch('/data/icd10pcs-index.json').then((r) => r.ok ? r.json() : Promise.reject('PCS index not found')),
        fetch('/data/icd10cm-details.json').then((r) => r.ok ? r.json() : Promise.reject('CM details not found')),
        fetch('/data/icd10pcs-tables.json').then((r) => r.ok ? r.json() : Promise.reject('PCS tables not found')),
        fetch('/data/hcpcs-index.json').then((r) => r.ok ? r.json() : Promise.reject('HCPCS index not found')),
        fetch('/data/hcpcs-modifiers.json').then((r) => r.ok ? r.json() : Promise.reject('HCPCS modifiers not found')),
      ]);

      const cmIndex = cmIndexRes.status === 'fulfilled'
        ? (cmIndexRes.value as ICD10IndexEntry[]).map(e => ({ ...e, taxonomy: 'ICD-10-CM' as const }))
        : [];
      const pcsIndex = pcsIndexRes.status === 'fulfilled'
        ? (pcsIndexRes.value as ICD10IndexEntry[]).map(e => ({ ...e, taxonomy: 'ICD-10-PCS' as const }))
        : [];
      const cmDetails = cmDetailsRes.status === 'fulfilled' ? cmDetailsRes.value : {};
      const pcsTables = pcsTablesRes.status === 'fulfilled' ? pcsTablesRes.value : [];
      const hcpcsIndex = hcpcsRes.status === 'fulfilled' ? hcpcsRes.value as HCPCSCode[] : [];
      const hcpcsModifiers = hcpcsModRes.status === 'fulfilled' ? hcpcsModRes.value as HCPCSModifier[] : [];

      set({
        cmIndex,
        pcsIndex,
        cmDetails,
        pcsTables,
        hcpcsIndex,
        hcpcsModifiers,
        isLoading: false,
        loadProgress: {
          cm: cmIndexRes.status === 'fulfilled',
          pcs: pcsIndexRes.status === 'fulfilled',
          details: cmDetailsRes.status === 'fulfilled',
          tables: pcsTablesRes.status === 'fulfilled',
          hcpcs: hcpcsRes.status === 'fulfilled',
        },
      });

      console.log(
        `[CodeDatabase] Loaded: ${cmIndex.length} CM codes, ${pcsIndex.length} PCS codes, ` +
        `${Object.keys(cmDetails).length} CM details, ${pcsTables.length} PCS tables, ` +
        `${hcpcsIndex.length} HCPCS codes, ${hcpcsModifiers.length} HCPCS modifiers`
      );
    } catch (error) {
      set({ isLoading: false, loadError: String(error) });
    }
  },

  search: (query, taxonomy) => {
    const { cmIndex, pcsIndex, hcpcsIndex, searchTaxonomy } = get();
    const tax = taxonomy ?? searchTaxonomy;
    const q = query.toLowerCase().trim();

    if (!q) {
      set({ searchQuery: query, searchResults: [], hcpcsSearchResults: [], searchTaxonomy: tax });
      return;
    }

    // ICD-10 search
    let pool: ICD10IndexEntry[] = [];
    if (tax === 'all' || tax === 'ICD-10-CM') pool = pool.concat(cmIndex);
    if (tax === 'all' || tax === 'ICD-10-PCS') pool = pool.concat(pcsIndex);

    const scored = pool
      .map((entry) => {
        let score = 0;
        const code = entry.code.toLowerCase();
        const desc = entry.desc.toLowerCase();
        if (code === q) score += 100;
        else if (code.startsWith(q)) score += 50;
        else if (code.includes(q)) score += 30;
        const words = q.split(/\s+/);
        const descWords = desc.split(/\s+/);
        const matchedWords = words.filter((w) => descWords.some((dw) => dw.startsWith(w)));
        if (matchedWords.length === words.length) score += 40;
        else if (matchedWords.length > 0) score += 20 * (matchedWords.length / words.length);
        if (desc.includes(q)) score += 25;
        if (entry.billable && score > 0) score += 5;
        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 200)
      .map((s) => s.entry);

    // HCPCS search (when HCPCS or all selected)
    let hcpcsResults: HCPCSCode[] = [];
    if (tax === 'all' || tax === 'HCPCS') {
      hcpcsResults = get().searchHCPCS(q);
    }

    set({ searchQuery: query, searchResults: scored, hcpcsSearchResults: hcpcsResults, searchTaxonomy: tax });
  },

  searchHCPCS: (query) => {
    const { hcpcsIndex } = get();
    const q = query.toLowerCase().trim();
    if (!q) return [];

    return hcpcsIndex
      .map((entry) => {
        let score = 0;
        const code = entry.code.toLowerCase();
        const desc = entry.desc.toLowerCase();
        const shortDesc = (entry.shortDesc || '').toLowerCase();
        if (code === q) score += 100;
        else if (code.startsWith(q)) score += 50;
        else if (code.includes(q)) score += 30;
        const words = q.split(/\s+/);
        const descWords = desc.split(/\s+/);
        const matchedWords = words.filter((w) => descWords.some((dw) => dw.startsWith(w)));
        if (matchedWords.length === words.length) score += 40;
        else if (matchedWords.length > 0) score += 20 * (matchedWords.length / words.length);
        if (desc.includes(q)) score += 25;
        if (shortDesc.includes(q)) score += 15;
        // Category boost for known searches
        if (entry.category.toLowerCase().includes(q)) score += 10;
        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 200)
      .map((s) => s.entry);
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().search(query);
  },

  setSearchTaxonomy: (taxonomy) => {
    set({ searchTaxonomy: taxonomy });
    const { searchQuery } = get();
    if (searchQuery) get().search(searchQuery, taxonomy);
  },

  getCodeDetail: (code) => get().cmDetails[code],

  getHCPCSCode: (code) => {
    const { hcpcsIndex } = get();
    return hcpcsIndex.find(h => h.code === code);
  },

  getTotalCodeCount: () => {
    const { cmIndex, pcsIndex, hcpcsIndex } = get();
    return cmIndex.length + pcsIndex.length + hcpcsIndex.length;
  },
}));
