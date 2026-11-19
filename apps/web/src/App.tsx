import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Wordmark } from '@/components/ui/Wordmark';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { OAuthCallbackPage } from '@/features/auth/OAuthCallbackPage';
import { WelcomePage } from '@/features/auth/WelcomePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LibraryPage } from '@/features/library/LibraryPage';
import { DocumentDetailPage } from '@/features/library/DocumentDetailPage';
import { UploadPage } from '@/features/library/UploadPage';
import { SubjectsWorkspace } from '@/features/subjects/SubjectsWorkspace';
import { GpaPage } from '@/features/gpa/GpaPage';
import { DecksPage } from '@/features/decks/DecksPage';
import { LecturersPage } from '@/features/lecturers/LecturersPage';
import { LecturerPage } from '@/features/lecturers/LecturerPage';
import { DeckPage } from '@/features/decks/DeckPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { useAuth } from '@/providers/AuthProvider';
import { STAFF_ROLES } from '@kaned/shared';

// The admin area is its own chunk: students never download it.
const admin = () => import('@/features/admin');
const AdminShell = lazy(() => admin().then((m) => ({ default: m.AdminShell })));
const OverviewPage = lazy(() => admin().then((m) => ({ default: m.OverviewPage })));
const AdminDocumentsPage = lazy(() => admin().then((m) => ({ default: m.DocumentsPage })));
const UniversitiesPage = lazy(() => admin().then((m) => ({ default: m.UniversitiesPage })));
const UniversityDetailPage = lazy(() => admin().then((m) => ({ default: m.UniversityDetailPage })));
const AdminSubjectsPage = lazy(() => admin().then((m) => ({ default: m.SubjectsPage })));
const AdminSubjectDetailPage = lazy(() => admin().then((m) => ({ default: m.SubjectDetailPage })));
const CurriculumPage = lazy(() => admin().then((m) => ({ default: m.CurriculumPage })));
const UsersPage = lazy(() => admin().then((m) => ({ default: m.UsersPage })));
const UserDetailPage = lazy(() => admin().then((m) => ({ default: m.UserDetailPage })));
const GradesPage = lazy(() => admin().then((m) => ({ default: m.GradesPage })));
const ActivityPage = lazy(() => admin().then((m) => ({ default: m.ActivityPage })));
const AdminDecksPage = lazy(() => admin().then((m) => ({ default: m.DecksPage })));
const AdminLecturersPage = lazy(() => admin().then((m) => ({ default: m.LecturersPage })));

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

/** Moderators and admins only; some pages narrow it to admins. */
function RequireStaff({ adminOnly, children }: { adminOnly?: boolean; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !STAFF_ROLES.includes(user.role)) return <Navigate to="/app" replace />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/admin" replace />;
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
      {/* Back from Google / Microsoft / GitHub / Facebook; works signed in or out. */}
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/welcome" element={<RequireAuth><WelcomePage /></RequireAuth>} />

      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:id" element={<DocumentDetailPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="subjects" element={<SubjectsWorkspace />} />
        <Route path="subjects/:code" element={<SubjectsWorkspace />} />
        <Route path="tools/gpa" element={<GpaPage />} />
        <Route path="flashcards" element={<DecksPage />} />
        <Route path="lecturers" element={<LecturersPage />} />
        <Route path="lecturers/:id" element={<LecturerPage />} />
        <Route path="flashcards/:id" element={<DeckPage />} />
        <Route path="flashcards/:id/:mode" element={<DeckPage />} />
        <Route path="saved" element={<ProfilePage defaultTab="saved" />} />
        <Route path="profile" element={<ProfilePage defaultTab="uploads" />} />
        <Route path="settings" element={<SettingsPage />} />

        {/* Older addresses, kept so saved links keep working. */}
        <Route path="planner" element={<Navigate to="/app/subjects" replace />} />
        <Route path="tools/subjects" element={<Navigate to="/app/subjects" replace />} />
        <Route path="tools/planner" element={<Navigate to="/app/subjects" replace />} />

        <Route path="*" element={<NotFoundPage inShell />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireStaff>
              <Suspense fallback={<Booting />}>
                <AdminShell />
              </Suspense>
            </RequireStaff>
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="documents" element={<AdminDocumentsPage />} />
        <Route path="universities" element={<RequireStaff adminOnly><UniversitiesPage /></RequireStaff>} />
        <Route path="universities/:id" element={<RequireStaff adminOnly><UniversityDetailPage /></RequireStaff>} />
        <Route path="subjects" element={<RequireStaff adminOnly><AdminSubjectsPage /></RequireStaff>} />
        <Route path="subjects/:id" element={<RequireStaff adminOnly><AdminSubjectDetailPage /></RequireStaff>} />
        <Route path="curriculum" element={<RequireStaff adminOnly><CurriculumPage /></RequireStaff>} />
        <Route path="curriculum/:majorId" element={<RequireStaff adminOnly><CurriculumPage /></RequireStaff>} />
        <Route path="users" element={<RequireStaff adminOnly><UsersPage /></RequireStaff>} />
        <Route path="users/:id" element={<RequireStaff adminOnly><UserDetailPage /></RequireStaff>} />
        <Route path="grades" element={<RequireStaff adminOnly><GradesPage /></RequireStaff>} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="decks" element={<AdminDecksPage />} />
        <Route path="lecturers" element={<AdminLecturersPage />} />
        <Route path="*" element={<NotFoundPage inShell />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
