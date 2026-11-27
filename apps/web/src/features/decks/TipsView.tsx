import { useMemo, useState } from 'react';
import { CircleCheckBig, Lightbulb, TriangleAlert } from 'lucide-react';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDeckCtx } from './context';
import { QText, TipBody } from './parts';

export function TipsView() {
  const { m, startPractice, go } = useDeckCtx();
  const [ch, setCh] = useState(0);
  const covered = useMemo(() => m.Q.filter((q) => q.tips.length).length, [m]);
  const total = m.tips.size;
  const groups = useMemo(() => {
    const chapters = m.chapters.length ? m.chapters : [{ n: 0, name: '' }];
    return chapters
      .filter((c) => !ch || c.n === ch)
      .map((c) => ({
        ...c,
        tips: [...m.tips.values()].filter((t) => t.chapter === c.n),
        warnings: m.warnings.filter((q) => q.chapter === c.n),
      }))
      .filter((g) => g.tips.length || g.warnings.length);
  }, [m, ch]);

  const practise = (ids: string[], label: string) => {
    startPractice({ custom: { ids, label } });
    go('practice');
  };

  if (!total && !m.warnings.length) {
    return (
      <div className="dk-empty">
        <h3>Bộ đề này chưa có mẹo nhớ</h3>
        <p>Mẹo nhớ được viết trong file bộ đề bằng dòng “## Mẹo …”. Khi bộ đề được cập nhật, mẹo sẽ hiện ở đây và ngay sau mỗi câu trả lời.</p>
      </div>
    );
  }

  return (
    <div className="dk-tips">
      <p className="dk-lead">
        {fmtInt(total)} mẹo gom các ý hay bị hỏi, các cặp câu dễ nhầm và cách nhận ra đáp án qua từ khoá, dùng cho {fmtInt(covered)} câu. Mẹo cũng hiện ngay sau khi bạn trả lời (tắt được trong Cài đặt học).
        {m.warnings.length > 0 && ` ${m.warnings.length} câu có lưu ý vì đáp án của đề khác giáo trình.`}
      </p>
      {m.chapters.length > 1 && (
        <div className="dk-filters">
          <div className="seg dk-seg" role="group" aria-label="Lọc theo chương">
            <button type="button" aria-pressed={!ch} onClick={() => setCh(0)}>
              Tất cả<span className="dk-n">{fmtInt(total + m.warnings.length)}</span>
            </button>
            {m.chapters.map((c) => {
              const n = [...m.tips.values()].filter((t) => t.chapter === c.n).length + m.warnings.filter((q) => q.chapter === c.n).length;
              return n ? (
                <button key={c.n} type="button" aria-pressed={ch === c.n} onClick={() => setCh(c.n)}>
                  {c.pe ? 'PE' : `Chương ${c.n}`}
                  <span className="dk-n">{n}</span>
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.n} className="dk-tip-group">
          {g.name && (
            <div className="dk-ch-head">
              <span className="dk-lnum">{g.n || '–'}</span>
              <h2>{g.name}</h2>
            </div>
          )}
          <div className="dk-tip-grid">
            {g.tips.map((t) => {
              const ids = m.tipQuestions.get(t.n) ?? [];
              return (
                <article key={t.n} className="dk-tip-card">
                  <h3>
                    <Lightbulb className="ic ic-sm" />
                    <span>{t.title}</span>
                  </h3>
                  <TipBody body={t.body} />
                  <footer>
                    <span>{ids.length ? `${fmtInt(ids.length)} câu liên quan` : 'Mẹo chung'}</span>
                    {ids.length > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => practise(ids, `Đang luyện ${ids.length} câu của mẹo “${t.title}”`)}>
                        <CircleCheckBig className="ic ic-sm" />
                        Luyện các câu này
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
            {g.warnings.map((q) => (
              <article key={`w${q.id}`} className={cn('dk-tip-card', 'is-warn')}>
                <h3>
                  <TriangleAlert className="ic ic-sm" />
                  <span>Lưu ý · Đáp án câu {q.id}</span>
                </h3>
                <QText text={q.text} small as="div" />
                <TipBody body={q.warning!} />
                <footer>
                  <span>Đáp án theo bộ đề: {q.answers.map((k) => q.options[k]).join('; ')}</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => practise([q.id], `Đang luyện câu ${q.id}`)}>
                    <CircleCheckBig className="ic ic-sm" />
                    Luyện câu này
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
