import { BookOpen, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function TeacherHomeSelector() {
  const { userProfile, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 p-6">
      <main className="glass-card animate-fade-up max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Teacher Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">{userProfile?.displayName} · {userProfile?.email}</p>
        <p className="mt-4 text-sm text-slate-600">
          Your assigned academic contexts will appear here once the Super Admin assigns subjects (Milestone 3).
        </p>
        <button id="logout-button" type="button" className="btn-secondary mt-6" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </main>
    </div>
  );
}
