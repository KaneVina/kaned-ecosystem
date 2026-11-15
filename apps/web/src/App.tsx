import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Wordmark } from '@/components/ui/Wordmark';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { DocumentDetailPage } from '@/features/library/DocumentDetailPage';
import { UploadPage } from '@/features/library/UploadPage';
import { SubjectsWorkspace } from '@/features/subjects/SubjectsWorkspace';
import { GpaPage } from '@/features/gpa/GpaPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { useAuth } from '@/providers/AuthProvider';

/** Shown while the refresh cookie is exchanged for a session. */
function Booting() {
  return (
    <div className="booting">
      <div>
        <Wordmark />
        <p>Đang mở không gian học tập…</p>
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

/** Signed-in people have no reason to see the auth screens. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user, initialising } = useAuth();
  if (initialising) return <Booting />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:id" element={<DocumentDetailPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="subjects" element={<SubjectsWorkspace />} />
        <Route path="subjects/:code" element={<SubjectsWorkspace />} />
        <Route path="tools/gpa" element={<GpaPage />} />
        <Route path="saved" element={<ProfilePage defaultTab="saved" />} />
        <Route path="profile" element={<ProfilePage defaultTab="uploads" />} />

        {/* Older addresses, kept so saved links keep working. */}
        <Route path="planner" element={<Navigate to="/app/subjects" replace />} />
        <Route path="tools/subjects" element={<Navigate to="/app/subjects" replace />} />
        <Route path="tools/planner" element={<Navigate to="/app/subjects" replace />} />

        <Route path="*" element={<NotFoundPage inShell />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
