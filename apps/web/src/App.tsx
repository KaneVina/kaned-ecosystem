import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LandingPage } from '@/features/landing/LandingPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { DocumentDetailPage } from '@/features/library/DocumentDetailPage';
import { UploadPage } from '@/features/library/UploadPage';
import { SavedPage } from '@/features/saved/SavedPage';
import { GpaPage } from '@/features/gpa/GpaPage';
import { SubjectsPage } from '@/features/subjects/SubjectsPage';
import { SubjectDetailPage } from '@/features/subjects/SubjectDetailPage';
import { PlannerPage } from '@/features/subjects/PlannerPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { useAuth } from '@/providers/AuthProvider';
import { Wordmark } from '@/components/ui/Wordmark';

/** Full-screen holder shown while the refresh cookie is being exchanged. */
function Booting() {
  return (
    <div className="grid min-h-screen place-items-center bg-paper">
      <div className="text-center">
        <Wordmark />
        <p className="mt-4 text-sm text-ink-3">Đang mở không gian học tập…</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <Booting />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Someone already signed in has no reason to see the auth screens. */
function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, initialising } = useAuth();
  if (initialising) return <Booting />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:id" element={<DocumentDetailPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="saved" element={<SavedPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="subjects/:code" element={<SubjectDetailPage />} />
        <Route path="planner" element={<PlannerPage />} />
        <Route path="profile" element={<ProfilePage />} />

        {/* The tool menu addresses everything under /app/tools. */}
        <Route path="tools/gpa" element={<GpaPage />} />
        <Route path="tools/subjects" element={<Navigate to="/app/subjects" replace />} />
        <Route path="tools/planner" element={<Navigate to="/app/planner" replace />} />

        <Route path="*" element={<NotFoundPage inShell />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
