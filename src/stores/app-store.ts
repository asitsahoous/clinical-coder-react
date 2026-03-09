import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Persona, ThemeMode, AnalysisMode, CodingSession, AuditRecord, DashboardMetrics } from '@/types/icd10';

interface AppState {
  // Persona & Theme
  persona: Persona;
  theme: ThemeMode;
  analysisMode: AnalysisMode;
  sidebarOpen: boolean;

  // AI Settings
  openAIKey: string;
  anthropicKey: string;

  // Sessions
  sessions: CodingSession[];
  activeSessionId: string | null;

  // Audit
  auditRecords: AuditRecord[];

  // Dashboard
  dashboardMetrics: DashboardMetrics;

  // Actions
  setPersona: (p: Persona) => void;
  toggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;
  setAnalysisMode: (m: AnalysisMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setOpenAIKey: (key: string) => void;
  setAnthropicKey: (key: string) => void;
  addSession: (session: CodingSession) => void;
  updateSession: (id: string, updates: Partial<CodingSession>) => void;
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => CodingSession | undefined;
  addAuditRecord: (record: AuditRecord) => void;
  updateDashboardMetrics: () => void;
}

const defaultMetrics: DashboardMetrics = {
  totalSessions: 0,
  autoApproved: 0,
  pendingReview: 0,
  averageConfidence: 0,
  tierDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
  topCodes: [],
  redFlagRate: 0,
  codingAccuracy: 0,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      persona: 'coder',
      theme: 'light',
      analysisMode: 'keyword',
      sidebarOpen: true,
      openAIKey: '',
      anthropicKey: '',
      sessions: [],
      activeSessionId: null,
      auditRecords: [],
      dashboardMetrics: defaultMetrics,

      setPersona: (persona) => set({ persona }),
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        set({ theme: newTheme });
      },
      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        set({ theme });
      },
      setAnalysisMode: (analysisMode) => set({ analysisMode }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setOpenAIKey: (openAIKey) => set({ openAIKey }),
      setAnthropicKey: (anthropicKey) => set({ anthropicKey }),

      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
      updateSession: (id, updates) =>
        set((s) => ({
          sessions: s.sessions.map((session) =>
            session.id === id ? { ...session, ...updates, updatedAt: new Date() } : session
          ),
        })),
      setActiveSession: (id) => set({ activeSessionId: id }),
      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId);
      },

      addAuditRecord: (record) => set((s) => ({ auditRecords: [record, ...s.auditRecords] })),

      updateDashboardMetrics: () => {
        const { sessions } = get();
        if (sessions.length === 0) {
          set({ dashboardMetrics: defaultMetrics });
          return;
        }
        const totalSessions = sessions.length;
        const autoApproved = sessions.filter((s) => s.status === 'approved').length;
        const pendingReview = sessions.filter((s) => s.status === 'pending_review').length;
        const avgConf = sessions.reduce((sum, s) => sum + s.overallConfidence, 0) / totalSessions;
        const tierDist = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<number, number>;
        sessions.forEach((s) => { tierDist[s.overallTier]++; });

        // Count top codes
        const codeCount: Record<string, { desc: string; count: number }> = {};
        sessions.forEach((s) => {
          s.results.forEach((r) => {
            if (!codeCount[r.code]) codeCount[r.code] = { desc: r.description, count: 0 };
            codeCount[r.code].count++;
          });
        });
        const topCodes = Object.entries(codeCount)
          .map(([code, { desc, count }]) => ({ code, desc, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const totalResults = sessions.reduce((sum, s) => sum + s.results.length, 0);
        const totalRedFlags = sessions.reduce(
          (sum, s) => sum + s.results.filter((r) => r.redFlags.length > 0).length,
          0
        );

        set({
          dashboardMetrics: {
            totalSessions,
            autoApproved,
            pendingReview,
            averageConfidence: Math.round(avgConf * 100) / 100,
            tierDistribution: tierDist as Record<1 | 2 | 3 | 4, number>,
            topCodes,
            redFlagRate: totalResults > 0 ? Math.round((totalRedFlags / totalResults) * 100) : 0,
            codingAccuracy: Math.round(avgConf * 100),
          },
        });
      },
    }),
    {
      name: 'clinical-coder-app',
      partialize: (state) => ({
        persona: state.persona,
        theme: state.theme,
        analysisMode: state.analysisMode,
        openAIKey: state.openAIKey,
        anthropicKey: state.anthropicKey,
        sessions: state.sessions,
        auditRecords: state.auditRecords,
      }),
    }
  )
);
