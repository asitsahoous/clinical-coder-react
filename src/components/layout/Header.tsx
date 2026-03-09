import { Sun, Moon, Menu, Activity, Shield, Settings } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useCodeDatabase } from '@/stores/code-database-store';
import { useNavigate, useLocation } from 'react-router-dom';

export function Header() {
  const { persona, theme, toggleTheme, toggleSidebar, setPersona } = useAppStore();
  const totalCodes = useCodeDatabase((s) => s.getTotalCodeCount());
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-4 gap-3 shrink-0 z-20">
      {/* Menu toggle */}
      <button onClick={toggleSidebar} className="p-1.5 hover:bg-surface-tertiary rounded-lg transition-colors" title="Toggle sidebar">
        <Menu size={20} className="text-text-secondary" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <Activity size={18} className="text-white" />
        </div>
        <div className="hidden sm:block">
          <h1 className="text-sm font-bold text-text-primary leading-tight">Clinical Coder</h1>
          <p className="text-[10px] text-text-muted leading-tight">ICD-10 CM/PCS 2026</p>
        </div>
      </div>

      {/* Code count badge */}
      {totalCodes > 0 && (
        <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium">
          <span>{totalCodes.toLocaleString()}</span>
          <span>codes loaded</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Persona Switch */}
      <div className="flex items-center bg-surface-tertiary rounded-lg p-0.5">
        <button
          onClick={() => { setPersona('coder'); if (location.pathname.startsWith('/audit')) navigate('/coding'); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            persona === 'coder' ? 'bg-primary-600 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Activity size={14} />
          <span className="hidden sm:inline">Coder</span>
        </button>
        <button
          onClick={() => { setPersona('auditor'); navigate('/audit'); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            persona === 'auditor' ? 'bg-amber-600 text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Shield size={14} />
          <span className="hidden sm:inline">Auditor</span>
        </button>
      </div>

      {/* Settings */}
      <button
        onClick={() => navigate('/settings')}
        className="p-1.5 hover:bg-surface-tertiary rounded-lg transition-colors"
        title="Settings"
      >
        <Settings size={18} className="text-text-secondary" />
      </button>

      {/* Theme toggle */}
      <button onClick={toggleTheme} className="p-1.5 hover:bg-surface-tertiary rounded-lg transition-colors" title="Toggle theme">
        {theme === 'light' ? <Moon size={18} className="text-text-secondary" /> : <Sun size={18} className="text-amber-400" />}
      </button>
    </header>
  );
}
