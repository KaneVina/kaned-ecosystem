import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { safeNextPath, STUDY_YEARS } from '@kaned/shared';
import { AuthLayout, FloatSelect } from './AuthLayout';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useMajors, useUniversities } from '@/features/catalog/queries';
import { toApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * The second half of sign-up for accounts made with Google, Microsoft, GitHub
 * or Facebook: the provider gave a name and an email, Kaned still needs the
 * school and major to suggest the right subjects. Skippable.
 */
export function WelcomePage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const next = safeNextPath((location.state as { next?: string } | null)?.next);

  const [universityId, setUniversityId] = useState(user?.university?.id ?? '');
  const [majorId, setMajorId] = useState(user?.majorId ?? '');
  const [year, setYear] = useState<number>(user?.year ?? 1);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);

  const { data: universities = [] } = useUniversities();
  const { data: majors = [] } = useMajors(universityId || undefined);

  const firstName = user?.name.trim().split(/\s+/).slice(-1)[0] ?? 'bạn';

  const save = async () => {
    if (!universityId || !majorId) {
      setMissing(true);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ universityId, majorId, year });
      toast.success(`Chào ${firstName}!`, 'Kaned đã sẵn sàng với chương trình học của bạn.');
      navigate(next, { replace: true });
    } catch (error) {
      toast.error('Chưa lưu được', toApiError(error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Tài khoản mới"
      title={`Chào ${firstName}, còn một bước`}
      subtitle="Chọn trường và ngành để Kaned gợi ý đúng môn học, điều kiện tiên quyết và tài liệu cho bạn. Bạn đổi lại được bất cứ lúc nào trong hồ sơ."
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="step-pane">
          <div className="auth-fields">
            <FloatSelect
              id="universityId"
              label="Trường"
              required
              value={universityId}
              error={missing && !universityId ? 'Chọn trường của bạn.' : undefined}
              onChange={(e) => {
                setUniversityId(e.target.value);
                setMajorId('');
              }}
            >
              <option value="" disabled />
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </FloatSelect>
            <FloatSelect
              id="majorId"
              label="Ngành"
              required
              disabled={!universityId}
              value={majorId}
              error={missing && universityId && !majorId ? 'Chọn ngành của bạn.' : undefined}
              onChange={(e) => setMajorId(e.target.value)}
            >
              <option value="" disabled />
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nameVi} — {m.name}
                </option>
              ))}
            </FloatSelect>
            <div className="year-pills" role="radiogroup" aria-label="Năm học">
              {STUDY_YEARS.map((y) => (
                <label key={y}>
                  <input type="radio" name="year" value={y} checked={year === y} onChange={() => setYear(y)} />
                  <span>Năm {y}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="auth-actions">
          <button type="button" className="btn btn-secondary btn-auth" onClick={() => navigate(next, { replace: true })}>
            Để sau
          </button>
          <button type="submit" className={cn('btn btn-primary btn-auth', saving && 'is-loading')} style={{ flex: 1 }}>
            Vào Kaned
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
