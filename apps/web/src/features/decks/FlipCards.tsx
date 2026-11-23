import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, RotateCcw, Shuffle, Star, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { beep, LET, makePerm, qLabel } from './model';
import { Banner, FilterBar, SeenTags, Inline, Notes, QText, StudyAids, StudyEmpty, HintToggle } from './parts';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function FlipCards() {
  const { m, state, settings, flip: F, setFlip, startFlip, progress } = useDeckCtx();
  const [flipped, setFlipped] = useState(false);
  const [leaving, setLeaving] = useState<null | { ok: boolean; from: number }>(null);
  const drag = useRef<HTMLDivElement>(null);
  const id = F.ids[F.idx];
  const q = id ? m.QI.get(id) : undefined;

  const perm = useMemo(() => (q ? (F.perm[q.id] ?? makePerm(q, settings.shuf)) : []), [q, F.perm, settings.shuf]);
  useEffect(() => {
    if (q && !F.perm[q.id]) setFlip((s) => ({ ...s, perm: { ...s.perm, [q.id]: perm } }));
  }, [q, F.perm, perm, setFlip]);
  const shufRef = useRef(settings.shuf);
  useEffect(() => {
    if (shufRef.current === settings.shuf) return;
    shufRef.current = settings.shuf;
    setFlip((s) => ({ ...s, perm: {} }));
  }, [settings.shuf, setFlip]);

  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setFlipped(false);
    // Space flips the card in front of you, so it holds the focus.
    card.current?.focus({ preventScroll: true });
  }, [id]);

  const rate = useCallback(
    (ok: boolean, from = 0) => {
      if (!q || leaving) return;
      progress.record(q.id, ok, { streak: false });
      if (settings.sound) beep(ok);
      const finish = () => {
        setLeaving(null);
        setFlip((s) => ({ ...s, idx: s.idx + 1, know: ok ? [...s.know, q.id] : s.know, again: ok ? s.again : [...s.again, q.id] }));
      };
      if (reduced()) return finish();
      setLeaving({ ok, from });
      window.setTimeout(finish, 280);
    },
    [q, leaving, progress, settings.sound, setFlip],
  );

  // Swipe: drag sideways past 110px to answer; a tap flips.
  const rateRef = useRef(rate);
  rateRef.current = rate;
  useEffect(() => {
    const d = drag.current;
    if (!d) return;
    let x0: number | null = null;
    let dx = 0;
    let moved = false;
    let pid = -1;
    const hintL = d.querySelector<HTMLElement>('.dk-swipe.is-l');
    const hintR = d.querySelector<HTMLElement>('.dk-swipe.is-r');
    const reset = () => {
      d.style.transform = '';
      if (hintL) hintL.style.opacity = '0';
      if (hintR) hintR.style.opacity = '0';
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button,summary,details,a')) return;
      x0 = e.clientX;
      dx = 0;
      moved = false;
      pid = e.pointerId;
    };
    const move = (e: PointerEvent) => {
      if (x0 === null || e.pointerId !== pid) return;
      dx = e.clientX - x0;
      if (Math.abs(dx) > 8 && !moved) {
        moved = true;
        try {
          d.setPointerCapture(pid);
        } catch {
          /* pointer already gone */
        }
      }
      if (!moved) return;
      d.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
      const k = Math.min(1, Math.abs(dx) / 120);
      if (hintL) hintL.style.opacity = String(dx < 0 ? k : 0);
      if (hintR) hintR.style.opacity = String(dx > 0 ? k : 0);
    };
    const up = (e: PointerEvent) => {
      if (x0 === null) return;
      x0 = null;
      if (!moved) {
        if (!(e.target as HTMLElement).closest('button,summary,details,a')) setFlipped((f) => !f);
        return;
      }
      if (Math.abs(dx) > 110) {
        const v = dx;
        reset();
        rateRef.current(v > 0, v);
      } else {
        d.style.transition = 'transform .3s var(--ease-out)';
        reset();
        window.setTimeout(() => (d.style.transition = ''), 320);
      }
    };
    const cancel = () => {
      x0 = null;
      reset();
    };
    d.addEventListener('pointerdown', down);
    d.addEventListener('pointermove', move);
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', cancel);
    return () => {
      d.removeEventListener('pointerdown', down);
      d.removeEventListener('pointermove', move);
      d.removeEventListener('pointerup', up);
      d.removeEventListener('pointercancel', cancel);
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      const t = e.target as HTMLElement;
      if (t.closest('input,select,textarea,[role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if ((t.tagName === 'BUTTON' && !t.closest('.dk-tabs')) || t.tagName === 'SUMMARY') return;
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        e.preventDefault();
        rate(true);
      } else if (e.key === 'ArrowLeft' || e.key === '1') {
        e.preventDefault();
        rate(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [q, rate]);

  const header = F.custom ? (
    <Banner label={F.custom.label} exitLabel="Về toàn bộ thẻ" onExit={() => startFlip()} />
  ) : (
    <FilterBar ch={F.ch} scope={F.scope} slice={F.slice} order={F.order} onChange={(o) => startFlip(o)} />
  );

  if (!F.ids.length) {
    return (
      <div className="dk-flip-wrap">
        {header}
        <StudyEmpty scope={F.scope} custom={Boolean(F.custom)} onAll={() => startFlip()} />
      </div>
    );
  }

  if (!q) {
    return (
      <div className="dk-flip-wrap">
        {header}
        <div className="dk-empty dk-finish">
          <h3>Hết bộ thẻ</h3>
          <p>
            Đã nhớ {fmtInt(F.know.length)} thẻ, chưa nhớ {fmtInt(F.again.length)} thẻ.{' '}
            {F.again.length ? 'Học lại các thẻ chưa nhớ ngay khi còn nóng.' : 'Bạn đã nhớ hết bộ thẻ này.'}
          </p>
          <div className="dk-row-center">
            {F.again.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => startFlip({ custom: { ids: F.again.slice(), label: `Đang học lại ${F.again.length} thẻ chưa nhớ` } })}>
                <RotateCcw className="ic ic-sm" />
                Học lại {fmtInt(F.again.length)} thẻ chưa nhớ
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => startFlip({ ch: F.ch, scope: F.scope, slice: F.slice, order: 'rand', custom: F.custom })}>
              <Shuffle className="ic ic-sm" />
              Xáo bộ mới
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isMarked = Boolean(state.mk[q.id]);
  const leaveX = leaving ? (leaving.ok ? 1 : -1) * Math.round(window.innerWidth * 0.7) : 0;

  return (
    <div className="dk-flip-wrap">
      {header}
      <div className="dk-progress">
        <span>
          <b>{F.idx + 1}</b> / {fmtInt(F.ids.length)}
        </span>
        <div className="dk-bar">
          <i className="is-ok" style={{ width: `${(F.know.length / F.ids.length) * 100}%` }} />
          <i className="is-bad" style={{ width: `${(F.again.length / F.ids.length) * 100}%` }} />
        </div>
      </div>

      <div className="dk-flip">
        <div
          key={q.id}
          ref={drag}
          className={cn('dk-drag', leaving ? 'is-leaving' : 'is-entering')}
          style={leaving ? { transform: `translateX(${leaveX}px) rotate(${leaveX / 22}deg)`, opacity: 0 } : undefined}
        >
          <div className="dk-swipe is-l">Chưa nhớ</div>
          <div className="dk-swipe is-r">Đã nhớ</div>
          <div ref={card} className={cn('dk-fc', flipped && 'is-flipped')} role="button" tabIndex={0} aria-label={flipped ? 'Mặt đáp án. Bấm để lật lại' : 'Mặt câu hỏi. Bấm để lật'}>
            <div className="dk-face is-front" aria-hidden={flipped}>
              <div className="dk-qhead">
                <span className="dk-qnum">{qLabel(q)}</span>
                {q.chapter > 0 && <span className="dk-tag">Chương {q.chapter}</span>}
                <SeenTags q={q} />
                {q.parent && <span className="dk-tag is-var">Kiểu hỏi khác</span>}
                {q.answers.length > 1 && <span className="dk-tag is-multi">{q.answers.length} đáp án</span>}
                <span className="spacer" />
                <button type="button" className={cn('icon-btn dk-star', isMarked && 'is-on')} aria-pressed={isMarked} aria-label="Đánh dấu" onClick={() => progress.toggleMark(q.id)}>
                  <Star className="ic ic-sm" />
                </button>
              </div>
              <QText text={q.text} />
              <ul className="dk-fopts">
                {perm.map((k, pos) => (
                  <li key={k}>
                    <b>{LET[pos]}</b>
                    <span><Inline text={q.options[k]} /></span>
                  </li>
                ))}
              </ul>
              <HintToggle key={q.id} hint={q.hint} />
              <div className="dk-face-foot">
                <RefreshCw className="ic ic-xs" />
                Bấm vào thẻ hoặc phím <kbd>Space</kbd> để lật
              </div>
            </div>
            <div className="dk-face is-back" aria-hidden={!flipped}>
              <div className="dk-qhead">
                <span className="dk-qnum">Đáp án</span>
                <span className="dk-tag">{qLabel(q)}</span>
              </div>
              <ul className="dk-ans">
                {q.answers.map((k) => (
                  <li key={k}>
                    <b>{LET[perm.indexOf(k)]}</b>
                    <span><Inline text={q.options[k]} /></span>
                  </li>
                ))}
              </ul>
              <Notes q={q} />
              <StudyAids q={q} sim={false} />
              <details className="dk-review">
                <summary>Xem lại câu hỏi</summary>
                <QText text={q.text} small as="div" />
                <ul className="dk-fopts">
                  {perm.map((k, pos) => (
                    <li key={k} className={q.answers.includes(k) ? 'is-right' : ''}>
                      <b>{LET[pos]}</b>
                      <span><Inline text={q.options[k]} /></span>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="dk-face-foot">Bạn đã nhớ đúng đáp án chưa?</div>
            </div>
          </div>
        </div>
      </div>

      <div className="dk-fctrl">
        <button type="button" className="btn btn-lg dk-again" onClick={() => rate(false)}>
          <X className="ic ic-sm" />
          Chưa nhớ
        </button>
        <button type="button" className="btn btn-secondary btn-lg dk-flipb" onClick={() => setFlipped((f) => !f)}>
          <RefreshCw className="ic ic-sm" />
          Lật thẻ
        </button>
        <button type="button" className="btn btn-lg dk-know" onClick={() => rate(true)}>
          <Check className="ic ic-sm" />
          Đã nhớ
        </button>
      </div>
      <div className="dk-fstat">
        <span>
          <i className="dk-dot is-ok" />
          Đã nhớ {fmtInt(F.know.length)}
        </span>
        <span>
          <i className="dk-dot is-bad" />
          Chưa nhớ {fmtInt(F.again.length)}
        </span>
        <span className="dk-hint">
          <kbd>←</kbd> chưa nhớ · <kbd>Space</kbd> lật · <kbd>→</kbd> đã nhớ · vuốt thẻ sang trái hoặc phải
        </span>
      </div>
    </div>
  );
}
