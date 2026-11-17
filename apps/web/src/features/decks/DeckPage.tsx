import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircleCheckBig, Layers, LayoutDashboard, Lightbulb, Search, Settings2, Timer } from 'lucide-react';
import { STAFF_ROLES, type DeckDetailDto } from '@kaned/shared';
import { PageHead } from '@/components/ui/Panel';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/providers/AuthProvider';
import { fmtInt } from '@/lib/format';
import { useDeck } from './api';
import { DeckContext, MODES, type BrowseState, type DeckCtx, type Mode, type StartOptions } from './context';
import {
  countsOf,
  newExam,
  poolOf,
  shuffle,
  useDeckModel,
  useDeckProgress,
  useStudySettings,
  type ExamSession,
  type FlipSession,
  type PracticeSession,
} from './model';
import { Overview } from './Overview';
import { Practice } from './Practice';
import { FlipCards } from './FlipCards';
import { Exam } from './Exam';
import { TipsView } from './TipsView';
import { Browse } from './Browse';
import './decks.css';

const TABS: Array<{ mode: Mode; label: string; icon: typeof Layers }> = [
  { mode: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { mode: 'practice', label: 'Luyện tập', icon: CircleCheckBig },
  { mode: 'flip', label: 'Lật thẻ', icon: Layers },
  { mode: 'exam', label: 'Thi thử', icon: Timer },
  { mode: 'tips', label: 'Mẹo nhớ', icon: Lightbulb },
  { mode: 'browse', label: 'Tra cứu', icon: Search },
];

export function DeckPage() {
  const { id = '', mode: rawMode } = useParams();
  const { data, isLoading, isError, refetch } = useDeck(id);

  if (isLoading) {
    return (
      <div className="container dk-loading">
        <Skeleton style={{ height: 28, width: 260 }} />
        <Skeleton style={{ height: 40, width: '60%', marginTop: 14 }} />
        <Skeleton style={{ height: 320, marginTop: 28, borderRadius: 14 }} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <ErrorState title="Không mở được bộ đề" description="Bộ đề có thể đã bị ẩn hoặc xoá." onRetry={() => void refetch()} />
      </div>
    );
  }
  const mode = (MODES as readonly string[]).includes(rawMode ?? '') ? (rawMode as Mode) : 'overview';
  // Keyed by deck: switching decks starts fresh sessions.
  return <DeckStudy key={data.id} deck={data} mode={mode} />;
}

function DeckStudy({ deck, mode }: { deck: DeckDetailDto; mode: Mode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const m = useDeckModel(deck);
  const progress = useDeckProgress(deck);
  const state = progress.state;
  const [settings, setSetting] = useStudySettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const buildPractice = useCallback(
    (o: StartOptions = {}): PracticeSession => {
      const ch = o.ch ?? 0;
      const scope = o.scope ?? 'all';
      const order = o.order ?? 'seq';
      const custom = o.custom ?? null;
      const ids = custom ? custom.ids.slice() : poolOf(m, progress.state, ch, scope);
      if (order === 'rand') shuffle(ids);
      const idx = o.startId && ids.includes(o.startId) ? ids.indexOf(o.startId) : 0;
      return { ch, scope, order, ids, idx, perm: {}, res: {}, custom, finished: false };
    },
    [m, progress.state],
  );
  const buildFlip = useCallback(
    (o: StartOptions = {}): FlipSession => {
      const ch = o.ch ?? 0;
      const scope = o.scope ?? 'all';
      const order = o.order ?? 'rand';
      const custom = o.custom ?? null;
      const ids = custom ? custom.ids.slice() : poolOf(m, progress.state, ch, scope);
      if (order === 'rand') shuffle(ids);
      return { ch, scope, order, ids, idx: 0, know: [], again: [], perm: {}, custom };
    },
    [m, progress.state],
  );

  // Practice picks up where it stopped last time.
  const [practice, setPractice] = useState<PracticeSession>(() => {
    const pr = deck.state?.pr;
    return buildPractice(pr && m.QI.has(pr.id) ? { ch: pr.ch, startId: pr.id } : {});
  });
  const [flip, setFlip] = useState<FlipSession>(() => buildFlip());
  const [exam, setExam] = useState<ExamSession>(newExam);
  const [browse, setBrowse] = useState<BrowseState>({ q: '', ch: 0, scope: 'all', hide: false, limit: 40 });

  const go = useCallback(
    (next: Mode) => {
      // Keys like Space and A–D belong to the study card, not the tab just clicked.
      (document.activeElement as HTMLElement | null)?.blur?.();
      navigate(`/app/flashcards/${deck.id}${next === 'overview' ? '' : `/${next}`}`);
      window.scrollTo({ top: 0 });
    },
    [navigate, deck.id],
  );
  const startPractice = useCallback((o?: StartOptions) => setPractice(buildPractice(o)), [buildPractice]);
  const startFlip = useCallback((o?: StartOptions) => setFlip(buildFlip(o)), [buildFlip]);

  // An exam in progress survives switching tabs, not closing the page.
  useEffect(() => {
    if (exam.phase !== 'run') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [exam.phase]);

  const ctx: DeckCtx = {
    deck,
    m,
    state,
    progress,
    settings,
    setSetting,
    practice,
    setPractice,
    flip,
    setFlip,
    exam,
    setExam,
    browse,
    setBrowse,
    startPractice,
    startFlip,
    go,
  };

  const counts = useMemo(() => countsOf(m, state), [m, state]);
  const staff = user && STAFF_ROLES.includes(user.role);
  const tipTotal = m.tips.size + m.warnings.length;
  const subject = deck.subject;

  return (
    <DeckContext.Provider value={ctx}>
      <PageHead
        crumbs={[{ label: 'Tổng quan', to: '/app' }, { label: 'Thẻ ghi nhớ', to: '/app/flashcards' }, { label: subject.code }]}
        title={deck.title}
        description={
          <>
            <Link className="dk-subj" to={`/app/subjects/${subject.code}`}>
              <i style={{ background: subject.university.color }} />
              {subject.code} · {subject.nameVi}
            </Link>
            {deck.description ? ` — ${deck.description}` : ''}
          </>
        }
        actions={
          <>
            {staff && (
              <Link className="btn btn-ghost btn-sm" to={`/admin/decks?edit=${deck.id}`}>
                Sửa bộ đề
              </Link>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="ic ic-sm" />
              Cài đặt học
            </button>
          </>
        }
      >
        <div className="tabs dk-tabs" role="tablist" aria-label="Chế độ học">
          {TABS.map((t) => (
            <button key={t.mode} type="button" role="tab" aria-selected={mode === t.mode} onClick={() => go(t.mode)}>
              <t.icon className="ic ic-sm" />
              {t.label}
              {t.mode === 'practice' && counts.bad > 0 && <span className="count dk-count-bad">{fmtInt(counts.bad)}</span>}
              {t.mode === 'exam' && exam.phase === 'run' && <span className="count dk-count-live">Đang thi</span>}
              {t.mode === 'tips' && tipTotal > 0 && <span className="count">{fmtInt(tipTotal)}</span>}
              {t.mode === 'browse' && <span className="count">{fmtInt(m.Q.length)}</span>}
            </button>
          ))}
        </div>
      </PageHead>

      <div className="container dk-body" key={mode}>
        {mode === 'overview' && <Overview />}
        {mode === 'practice' && <Practice />}
        {mode === 'flip' && <FlipCards />}
        {mode === 'exam' && <Exam />}
        {mode === 'tips' && <TipsView />}
        {mode === 'browse' && <Browse />}
      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Cài đặt học"
        description="Áp dụng cho mọi bộ đề trên thiết bị này. Tiến độ học được lưu vào tài khoản."
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setSettingsOpen(false)}>
            Xong
          </button>
        }
      >
        <div className="dk-settings">
          {(
            [
              ['tips', 'Hiện mẹo nhớ sau đáp án', 'Mẹo ghi nhớ và cách nhận ra đáp án qua từ khoá. "Lưu ý đáp án" luôn hiện.'],
              ['sim', 'Hiện câu dễ nhầm', 'Các câu gần giống kèm đáp án để so sánh.'],
              ['shuf', 'Xáo thứ tự đáp án', 'Cho luyện tập, lật thẻ và thi thử. Câu có "Tất cả các phương án trên" giữ nguyên.'],
              ['auto', 'Tự chuyển câu khi trả lời đúng', 'Trong chế độ luyện tập.'],
              ['sound', 'Âm thanh khi trả lời', 'Tiếng báo nhỏ khi đúng hoặc sai.'],
            ] as const
          ).map(([k, t, d]) => (
            <label key={k} className="switch-row">
              <span>
                <b>{t}</b>
                <small>{d}</small>
              </span>
              <input type="checkbox" className="switch" checked={settings[k]} onChange={(e) => setSetting(k, e.target.checked)} />
            </label>
          ))}
          <div className="switch-row dk-reset">
            <span>
              <b>Xoá tiến độ bộ đề này</b>
              <small>Xoá câu đã làm, câu đánh dấu và lịch sử thi thử của bộ đề.</small>
            </span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (!window.confirm('Xoá toàn bộ tiến độ của bộ đề này? Không thể hoàn tác.')) return;
                progress.reset();
                setPractice(buildPractice());
                setFlip(buildFlip());
                setExam(newExam());
                setSettingsOpen(false);
              }}
            >
              Xoá tiến độ
            </button>
          </div>
        </div>
      </Modal>
    </DeckContext.Provider>
  );
}
