import { useMemo, type ReactNode } from 'react';
import { matchesTermFilter } from '@kaned/shared';
import { Bookmark, CalendarClock, CircleCheckBig, Flame, Layers, Lightbulb, Play, RotateCcw, Timer } from 'lucide-react';
import { CountUp } from '@/components/ui/CountUp';
import { fmtInt } from '@/lib/format';
import { useDeckCtx } from './context';
import { countsOf, forecastOf, makeStatus, type Order, type Slice } from './model';
import { Ring } from './parts';

export function Overview() {
  const { m, state, deck, settings, practice, startPractice, startFlip, setExam, setBrowse, go } = useDeckCtx();
  const c = useMemo(() => countsOf(m, state, settings.srs), [m, state, settings.srs]);
  const pct = c.all ? (c.ok / c.all) * 100 : 0;
  const resumeId = practice.ids[practice.idx];
  const resuming = Boolean(state.pr && resumeId && practice.idx > 0);
  const variants = m.Q.length - m.base;
  const week = useMemo(() => (settings.srs ? forecastOf(m, state) : []), [m, state, settings.srs]);
  const soon = week.reduce((a, b) => a + b, 0);
  const tipTotal = m.tips.size;

  const termRows = useMemo(() => {
    const { status } = makeStatus(state, settings.srs);
    const row = (key: string, icon: ReactNode, title: string, slice: Slice, order: Order) => {
      const qs = m.Q.filter((q) => matchesTermFilter(q.seen, slice.term) && q.freq >= slice.min);
      const ok = qs.filter((q) => status(q.id) === 'ok').length;
      const bad = qs.filter((q) => status(q.id) === 'bad').length;
      return { key, icon, title, note: `${fmtInt(qs.length)} câu`, slice, order, bad, okp: qs.length ? (ok / qs.length) * 100 : 0, badp: qs.length ? (bad / qs.length) * 100 : 0, n: qs.length };
    };
    const out = [];
    if (m.maxFreq > 1) out.push(row('hot', <Flame className="ic dk-flame" />, 'Câu hay ra (từ 2 lần), nhiều nhất trước', { term: null, min: 2 }, 'freq'));
    for (const t of m.terms) out.push(row(t.term, <span className="dk-lterm">{t.term}</span>, `Chỉ kỳ ${t.term}`, { term: { mode: 'only', term: t.term }, min: 0 }, 'seq'));
    return out.filter((r) => r.n > 0);
  }, [m, state, settings.srs]);

  return (
    <div className="dk-overview">
      <section className="dk-hero">
        <Ring value={pct} size={210}>
          <b className="dk-ring-big">
            <CountUp value={Math.round(pct)} />
            <small>%</small>
          </b>
          <span className="dk-ring-cap">
            đã thuộc {fmtInt(c.ok)} / {fmtInt(c.all)} câu
          </span>
        </Ring>
        <div className="dk-hero-main">
          <h2 className="t-h2">{c.seen ? 'Ôn tiếp nào' : 'Bắt đầu ôn bộ đề này'}</h2>
          <p>
            {fmtInt(m.base)} câu trắc nghiệm{variants > 0 ? `, thêm ${fmtInt(variants)} câu kiểu hỏi khác` : ''}
            {tipTotal ? `, ${fmtInt(tipTotal)} mẹo nhớ` : ''}. Luyện từng câu để biết ngay đúng sai, lật thẻ để tự nhớ, hoặc làm đề thi thử có tính giờ.
          </p>
          {settings.srs && c.seen > 0 && (
            <p className="dk-plan">
              <CalendarClock className="ic ic-sm" />
              <span>
                {c.bad ? (
                  <>
                    Hôm nay cần ôn <b>{fmtInt(c.bad)} câu</b>
                  </>
                ) : (
                  'Hôm nay không còn câu nào cần ôn'
                )}
                {week[0]
                  ? `. Trong 24 giờ tới có thêm ${fmtInt(week[0])} câu tới hạn ôn`
                  : soon
                    ? `. 7 ngày tới có thêm ${fmtInt(soon)} câu tới hạn ôn`
                    : ''}
                .
              </span>
            </p>
          )}
          <div className="dk-hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => go('practice')}>
              <Play className="ic ic-sm" />
              {resuming ? `Học tiếp từ câu ${resumeId}` : 'Bắt đầu luyện tập'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => {
                setExam((e) => (e.phase === 'run' ? e : { ...e, phase: 'setup', n: Math.min(50, m.Q.length), ch: 0 }));
                go('exam');
              }}
            >
              <Timer className="ic ic-sm" />
              Thi thử {Math.min(50, m.Q.length)} câu
            </button>
            {tipTotal > 0 && (
              <button type="button" className="btn btn-ghost btn-lg" onClick={() => go('tips')}>
                <Lightbulb className="ic ic-sm" />
                Xem mẹo nhớ
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="dk-stats">
        <div className="dk-stat">
          <b>
            <CountUp value={c.seen} />
          </b>
          <span>
            <i className="dk-dot is-seen" />
            Đã làm
          </span>
        </div>
        <button
          type="button"
          className="dk-stat is-link"
          onClick={() => {
            setBrowse((b) => ({ ...b, ch: 0, scope: 'ok', q: '', limit: 40 }));
            go('browse');
          }}
        >
          <b>
            <CountUp value={c.ok} />
          </b>
          <span>
            <i className="dk-dot is-ok" />
            Đã thuộc
          </span>
        </button>
        <button
          type="button"
          className="dk-stat is-link"
          disabled={!c.bad}
          onClick={() => {
            startPractice({ scope: 'bad' });
            go('practice');
          }}
        >
          <b>
            <CountUp value={c.bad} />
          </b>
          <span>
            <i className="dk-dot is-bad" />
            Cần ôn lại
          </span>
        </button>
        <button
          type="button"
          className="dk-stat is-link"
          disabled={!c.mk}
          onClick={() => {
            startPractice({ scope: 'mk' });
            go('practice');
          }}
        >
          <b>
            <CountUp value={c.mk} />
          </b>
          <span>
            <Bookmark className="ic ic-xs" />
            Đánh dấu
          </span>
        </button>
        <div className="dk-stat">
          <b>
            <CountUp value={state.best} />
          </b>
          <span>
            <Flame className="ic ic-xs dk-flame" />
            Kỷ lục chuỗi đúng
          </span>
        </div>
      </div>

      {m.terms.length > 0 && (
        <section className="dk-section">
          <div className="dk-sec-head">
            <div>
              <h2 className="t-h3">Theo kỳ thi</h2>
              <p>Nhãn như [SU26_B5] ở đầu câu cho biết câu đó đã ra ở kỳ nào. Ôn riêng một kỳ, hoặc ôn câu hay ra nhất.</p>
            </div>
          </div>
          <div className="panel dk-ledger">
            {termRows.map((r) => (
              <div key={r.key} className="dk-lrow">
                <span className="dk-lnum">{r.icon}</span>
                <div className="dk-lname">
                  <b>{r.title}</b>
                  <small>{r.note}</small>
                </div>
                <div className="dk-lbar">
                  <div className="dk-bar">
                    <i className="is-ok" style={{ width: `${r.okp}%` }} />
                    <i className="is-bad" style={{ width: `${r.badp}%` }} />
                  </div>
                  <div className="dk-lbar-cap">
                    <span>{Math.round(r.okp)}% đã thuộc</span>
                    {r.bad > 0 && <span className="is-bad">{fmtInt(r.bad)} cần ôn</span>}
                  </div>
                </div>
                <div className="dk-lacts">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { startPractice({ slice: r.slice, order: r.order }); go('practice'); }}>
                    <CircleCheckBig className="ic ic-sm" />
                    Luyện tập
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { startFlip({ slice: r.slice, order: r.order }); go('flip'); }}>
                    <Layers className="ic ic-sm" />
                    Lật thẻ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {m.chapters.length > 0 && (
        <section className="dk-section">
          <div className="dk-sec-head">
            <div>
              <h2 className="t-h3">Theo chương</h2>
              <p>Tiến độ từng chương. {settings.srs ? 'Câu sai, câu đoán và câu tới hạn ôn' : 'Câu sai'} sẽ hiện ở mục “Cần ôn” để luyện lại.</p>
            </div>
          </div>
          <div className="panel dk-ledger">
            {m.chapters.map((ch) => {
              const k = countsOf(m, state, settings.srs, ch.n);
              const okp = k.all ? (k.ok / k.all) * 100 : 0;
              const badp = k.all ? (k.bad / k.all) * 100 : 0;
              return (
                <div key={ch.n} className="dk-lrow">
                  <span className="dk-lnum">{ch.n || '–'}</span>
                  <div className="dk-lname">
                    <b>{ch.name}</b>
                    <small>
                      {fmtInt(k.all)} câu{k.mk ? `, ${fmtInt(k.mk)} đánh dấu` : ''}
                    </small>
                  </div>
                  <div className="dk-lbar">
                    <div className="dk-bar">
                      <i className="is-ok" style={{ width: `${okp}%` }} />
                      <i className="is-bad" style={{ width: `${badp}%` }} />
                    </div>
                    <div className="dk-lbar-cap">
                      <span>{Math.round(okp)}% đã thuộc</span>
                      {k.bad > 0 && <span className="is-bad">{fmtInt(k.bad)} cần ôn</span>}
                    </div>
                  </div>
                  <div className="dk-lacts">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        startPractice({ ch: ch.n });
                        go('practice');
                      }}
                    >
                      <CircleCheckBig className="ic ic-sm" />
                      Luyện tập
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        startFlip({ ch: ch.n });
                        go('flip');
                      }}
                    >
                      <Layers className="ic ic-sm" />
                      Lật thẻ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {state.exams.length > 0 && (
        <section className="dk-section">
          <div className="dk-sec-head">
            <div>
              <h2 className="t-h3">Lần thi thử gần đây</h2>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go('exam')}>
              <RotateCcw className="ic ic-sm" />
              Thi lại
            </button>
          </div>
          <div className="dk-exam-strip">
            {state.exams.slice(0, 6).map((x) => (
              <div key={x.d} className={x.score >= 5 ? 'is-pass' : 'is-fail'}>
                <b>{(Math.round(x.score * 100) / 100).toLocaleString('vi-VN')}</b>
                <span>
                  {x.ok}/{x.n} câu · {new Date(x.d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="dk-foot-note">
        Cập nhật bộ đề {new Date(deck.updatedAt).toLocaleDateString('vi-VN')}. Tiến độ của bạn được lưu vào tài khoản, mở trên máy khác vẫn còn.
      </p>
    </div>
  );
}
