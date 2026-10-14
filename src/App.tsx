import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { AcademicProvider } from './context/AcademicContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/auth/LoginPage';
import AdminOverviewPage from './pages/admin/AdminOverviewPage';
import DepartmentsPage from './pages/admin/DepartmentsPage';
import AcademicSetupPage from './pages/admin/AcademicSetupPage';
import TeachersManagementPage from './pages/admin/TeachersManagementPage';
import GlobalOutcomesPage from './pages/admin/GlobalOutcomesPage';
import TimetableManagerPage from './pages/admin/TimetableManagerPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import TeacherHomeSelector from './pages/teacher/TeacherHomeSelector';
import SubjectWorkspacePage from './pages/teacher/SubjectWorkspacePage';
import TeachingPlanPage from './pages/teacher/TeachingPlanPage';
import AttendanceSessionPage from './pages/teacher/AttendanceSessionPage';
import MonthlyReportPage from './pages/teacher/MonthlyReportPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AcademicProvider>
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
            <Route path="reports" element={<AdminReportsPage />} />
          </Route>

          {/* Teacher Routes */}
          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['teacher', 'super_admin']}>
                <TeacherHomeSelector />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/subject/:subjectId/cags"
            element={
              <ProtectedRoute allowedRoles={['teacher', 'super_admin']}>
                <SubjectWorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/subject/:subjectId/teaching-plan"
            element={
              <ProtectedRoute allowedRoles={['teacher', 'super_admin']}>
                <TeachingPlanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/subject/:subjectId/attendance"
            element={
              <ProtectedRoute allowedRoles={['teacher', 'super_admin']}>
                <AttendanceSessionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/subject/:subjectId/monthly-report"
            element={
              <ProtectedRoute allowedRoles={['teacher', 'super_admin']}>
                <MonthlyReportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/subject/:subjectId"
            element={<Navigate to="cags" replace />}
          />


          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </AcademicProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
