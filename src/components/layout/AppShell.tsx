import { NavLink, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  GraduationCap, 
  Users, 
  Award, 
  CalendarClock, 
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AppShell() {
  const { userProfile, user, logout } = useAuth();

  const navItems = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/departments', label: 'Departments', icon: Building2 },
    { to: '/admin/academic-setup', label: 'Academic Setup', icon: GraduationCap },
    { to: '/admin/teachers', label: 'Teachers & Assignments', icon: Users },
    { to: '/admin/outcomes', label: 'Global Outcomes', icon: Award },
    { to: '/admin/timetables', label: 'Timetables', icon: CalendarClock },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between shrink-0 shadow-sm">
        <div>
          {/* Institution Brand */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-glow">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">CAGS Portal</h1>
                <p className="text-[11px] font-medium text-slate-400">Administration Console</p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Card & Sign Out */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 m-2 rounded-xl">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Super Admin</span>
          </div>
          <p className="text-xs font-medium text-slate-800 truncate">{userProfile?.displayName || 'Administrator'}</p>
          <p className="text-[11px] text-slate-500 truncate mb-3">{userProfile?.email || user?.email}</p>
          <button
            id="sidebar-logout"
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-red-600 active:scale-95"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Administration</span>
            <span>/</span>
            <span className="text-brand-700 font-semibold">Institutional Configuration</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge bg-brand-50 text-brand-700 border border-brand-200">
              Role: {userProfile?.role}
            </span>
            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
              Status: {userProfile?.status}
            </span>
          </div>
        </header>

        <main className="flex-1 p-8">
          <div className="mx-auto max-w-6xl animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
