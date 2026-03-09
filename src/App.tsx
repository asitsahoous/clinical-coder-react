import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAppStore } from '@/stores/app-store';
import { useCodeDatabase } from '@/stores/code-database-store';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { CodingWorkspacePage } from '@/pages/CodingWorkspacePage';
import { CodeBrowserPage } from '@/pages/CodeBrowserPage';
import { AuditPage } from '@/pages/AuditPage';
import { SessionsPage } from '@/pages/SessionsPage';
import { SettingsPage } from '@/pages/SettingsPage';

// Lazy-loaded pages (code-split for bundle optimization)
const DRGValidationPage = lazy(() => import('@/pages/DRGValidationPage'));
const FraudDashboardPage = lazy(() => import('@/pages/FraudDashboardPage'));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  const { theme } = useAppStore();
  const loadAllData = useCodeDatabase((s) => s.loadAllData);

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Load code database on mount
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/coding" element={<CodingWorkspacePage />} />
          <Route path="/browse" element={<CodeBrowserPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/drg" element={<Suspense fallback={<LazyFallback />}><DRGValidationPage /></Suspense>} />
          <Route path="/fraud" element={<Suspense fallback={<LazyFallback />}><FraudDashboardPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
