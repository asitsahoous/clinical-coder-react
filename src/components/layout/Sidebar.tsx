import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/stores/app-store';
import {
  LayoutDashboard,
  FileCode,
  BookOpen,
  Shield,
  Settings,
  FileText,
  ChevronRight,
  Activity,
  AlertTriangle,
  Heart,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  persona?: 'coder' | 'auditor' | 'both';
  badge?: string;
  group?: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} />, persona: 'both', group: 'main' },
  { path: '/coding', label: 'Coding Workspace', icon: <FileCode size={18} />, persona: 'coder', group: 'coding' },
  { path: '/browse', label: 'Code Browser', icon: <BookOpen size={18} />, persona: 'both', group: 'coding' },
  { path: '/drg', label: 'DRG Validation', icon: <Activity size={18} />, persona: 'both', group: 'validation', badge: 'NEW' },
  { path: '/audit', label: 'Audit Workspace', icon: <Shield size={18} />, persona: 'auditor', group: 'audit' },
  { path: '/fraud', label: 'Fraud Detection', icon: <AlertTriangle size={18} />, persona: 'auditor', group: 'audit', badge: 'NEW' },
  { path: '/sessions', label: 'Session History', icon: <FileText size={18} />, persona: 'both', group: 'other' },
  { path: '/settings', label: 'Settings', icon: <Settings size={18} />, persona: 'both', group: 'other' },
];

export function Sidebar() {
  const { sidebarOpen, persona } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  const filteredItems = navItems.filter(
    (item) => !item.persona || item.persona === 'both' || item.persona === persona
  );

  if (!sidebarOpen) return null;

  return (
    <aside className="w-56 bg-surface border-r border-border flex flex-col shrink-0 animate-fade-in">
      <nav className="flex-1 p-3 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
              }`}
            >
              <span className={isActive ? 'text-primary-600' : 'text-text-muted group-hover:text-text-secondary'}>
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && <ChevronRight size={14} className="text-primary-400" />}
              {item.badge && (
                <span className="px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded text-[10px] font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className={`w-2 h-2 rounded-full ${persona === 'coder' ? 'bg-primary-500' : 'bg-amber-500'}`} />
          <span className="text-xs text-text-muted capitalize">{persona} Mode</span>
        </div>
        <p className="text-[10px] text-text-muted px-2 mt-1">v3.0 &middot; FY2026 · 6 Code Systems</p>
      </div>
    </aside>
  );
}
