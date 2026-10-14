import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/auth/LoginPage';
import AdminOverviewPage from './pages/admin/AdminOverviewPage';
import DepartmentsPage from './pages/admin/DepartmentsPage';
import AcademicSetupPage from './pages/admin/AcademicSetupPage';
import TeachersManagementPage from './pages/admin/TeachersManagementPage';
import GlobalOutcomesPage from './pages/admin/GlobalOutcomesPage';
import TimetableManagerPage from './pages/admin/TimetableManagerPage';
import TeacherHomeSelector from './pages/teacher/TeacherHomeSelector';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" toastOptions={{ className: 'text-sm' }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Super Admin Routes wrapped in AppShell */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="academic-setup" element={<AcademicSetupPage />} />
            <Route path="teachers" element={<TeachersManagementPage />} />
            <Route path="outcomes" element={<GlobalOutcomesPage />} />
            <Route path="timetables" element={<TimetableManagerPage />} />
          </Route>

          {/* Teacher Routes */}
          <Route
            path="/teacher/*"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherHomeSelector />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
