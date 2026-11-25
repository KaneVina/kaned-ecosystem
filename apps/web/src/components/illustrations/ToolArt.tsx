import type { ReactNode } from 'react';

/**
 * One family of flat illustrations for Kaned's modules. Every scene shares the same
 * ingredients so they read as a set: a soft cobalt tile, a looping amber ribbon behind,
 * browser windows with three dots, book stacks, leaves, dots and little spark lines,
 * all in the site's palette (cobalt, navy, sky, amber, coral, green, paper).
 */

const C = {
  tile: '#EAF0FF',
  cobalt: '#2448D8',
  navy: '#162F96',
  ink: '#1B2340',
  sky: '#9DB6FF',
  mist: '#DCE6FF',
  amber: '#F2B13B',
  amberDeep: '#E39A27',
  coral: '#EE6A3A',
  green: '#1F8A5B',
  leaf: '#2E9E6A',
  leafDark: '#1D6E4A',
  paper: '#FFFFFF',
  paper2: '#F6F8FD',
  line: '#D4DDF3',
};

export type ToolArtName = 'library' | 'gpa' | 'subjects' | 'flashcards' | 'lecturers' | 'vec' | 'timetable' | 'empty' | 'error' | 'student' | 'lecturer' | 'fe' | 'pe';

/* ── shared pieces ─────────────────────────────────────────────── */

function Ribbon({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={C.amberDeep} strokeWidth="26" strokeLinecap="round" opacity=".35" transform="translate(3 5)" />
      <path d={d} fill="none" stroke={C.amber} strokeWidth="22" strokeLinecap="round" />
    </>
  );
}

function Window({ x, y, w, h, children, tilt = 0 }: { x: number; y: number; w: number; h: number; children?: ReactNode; tilt?: number }) {
  return (
    <g transform={`rotate(${tilt} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x + 4} y={y + 6} width={w} height={h} rx="12" fill={C.navy} opacity=".12" />
      <rect x={x} y={y} width={w} height={h} rx="12" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
      <path d={`M${x} ${y + 12}a12 12 0 0 1 12-12h${w - 24}a12 12 0 0 1 12 12v12H${x}z`} fill={C.paper2} />
      <circle cx={x + 14} cy={y + 12} r="3.6" fill={C.coral} />
      <circle cx={x + 25} cy={y + 12} r="3.6" fill={C.amber} />
      <circle cx={x + 36} cy={y + 12} r="3.6" fill={C.leaf} />
      <g transform={`translate(${x} ${y + 24})`}>{children}</g>
    </g>
  );
}

function Books({ x, y, colors = [C.leafDark, C.coral, C.cobalt] }: { x: number; y: number; colors?: string[] }) {
  return (
    <g>
      {colors.map((c, i) => {
        const w = 112 - i * 10;
        const bx = x + i * 6 - (i === 1 ? 10 : 0);
        const by = y - i * 18;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={w} height="18" rx="4" fill={c} />
            <rect x={bx + w - 14} y={by + 3} width="10" height="12" rx="2" fill={C.paper} opacity=".95" />
            <path d={`M${bx + 12} ${by + 9}h${w - 40}`} stroke={C.paper} strokeWidth="2" strokeLinecap="round" opacity=".55" />
          </g>
        );
      })}
    </g>
  );
}

function Leaf({ x, y, s = 1, r = 0, dark = false }: { x: number; y: number; s?: number; r?: number; dark?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M0 0C-14-18-12-44 0-60C12-44 14-18 0 0Z" fill={dark ? C.leafDark : C.leaf} />
      <path d="M0-4V-52" stroke={C.paper} strokeWidth="1.6" opacity=".45" strokeLinecap="round" />
    </g>
  );
}

function Sparks({ x, y, r = 0, color = C.amberDeep }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`} stroke={color} strokeWidth="4" strokeLinecap="round">
      <path d="M0 0v-14" />
      <path d="M12 4l9-10" />
      <path d="M-12 4l-9-10" />
    </g>
  );
}

function Lines({ x, y, w, n = 3, gap = 11, color = C.mist }: { x: number; y: number; w: number; n?: number; gap?: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth="6" strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${x} ${y + i * gap}h${i === n - 1 ? w * 0.6 : w}`} />
      ))}
    </g>
  );
}

function Check({ x, y, ok = true }: { x: number; y: number; ok?: boolean }) {
  return ok ? (
    <g>
      <rect x={x} y={y} width="16" height="16" rx="4" fill={C.green} />
      <path d={`M${x + 4} ${y + 8.5}l3 3 5-6.5`} stroke={C.paper} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ) : (
    <g stroke={C.coral} strokeWidth="3" strokeLinecap="round">
      <path d={`M${x + 3} ${y + 3}l10 10M${x + 13} ${y + 3}l-10 10`} />
    </g>
  );
}

function Frame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <svg viewBox="0 0 400 280" role="img" aria-label={title} preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="280" rx="22" fill={C.tile} />
      {children}
    </svg>
  );
}

/* ── scenes ────────────────────────────────────────────────────── */

const SCENES: Record<ToolArtName, { title: string; draw: () => ReactNode }> = {
  library: {
    title: 'Thư viện học liệu',
    draw: () => (
      <>
        <Ribbon d="M-10 200C60 120 120 250 190 170S300 40 360 110 420 230 380 260" />
        <circle cx="352" cy="44" r="16" fill={C.leaf} />
        <circle cx="40" cy="62" r="12" fill={C.coral} />
        <Window x={150} y={34} w={200} h={140} tilt={3}>
          <rect x="16" y="14" width="44" height="56" rx="6" fill={C.coral} opacity=".9" />
          <text x="38" y="48" textAnchor="middle" fontFamily="Arial Black, Arial" fontSize="12" fontWeight="900" fill={C.paper}>PDF</text>
          <Lines x={74} y={22} w={100} n={4} />
          <rect x="74" y="78" width="70" height="20" rx="10" fill={C.cobalt} />
          <path d="M84 88h8m-4-4 4 4-4 4" stroke={C.paper} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="160" cy="88" r="8" fill={C.amber} />
        </Window>
        <Window x={46} y={110} w={150} h={112} tilt={-5}>
          <rect x="14" y="12" width="122" height="20" rx="10" fill={C.paper2} stroke={C.line} />
          <circle cx="124" cy="22" r="5" fill="none" stroke={C.cobalt} strokeWidth="2.4" />
          <path d="M128 26l4 4" stroke={C.cobalt} strokeWidth="2.4" strokeLinecap="round" />
          <Lines x={16} y={46} w={90} n={3} />
        </Window>
        <Books x={232} y={244} />
        <Leaf x={36} y={262} s={1.1} r={-18} />
        <Leaf x={58} y={266} s={0.85} r={14} dark />
        <Sparks x={140} y={42} r={-20} />
      </>
    ),
  },
  gpa: {
    title: 'Tính GPA',
    draw: () => (
      <>
        <Ribbon d="M410 60C320 10 280 120 220 90S110 0 60 70-20 220 70 250" />
        <circle cx="46" cy="44" r="14" fill={C.leaf} />
        <circle cx="366" cy="226" r="12" fill={C.coral} />
        <Window x={122} y={30} w={226} h={150} tilt={2}>
          <path d="M22 108h184" stroke={C.line} strokeWidth="2" />
          {[34, 52, 70, 96].map((h, i) => (
            <rect key={i} x={30 + i * 30} y={106 - h} width="18" height={h} rx="4" fill={i === 3 ? C.coral : i === 2 ? C.amber : C.cobalt} />
          ))}
          <circle cx="178" cy="48" r="30" fill={C.mist} />
          <path d="M178 18a30 30 0 0 1 29 38l-29-8z" fill={C.cobalt} />
          <path d="M207 56a30 30 0 0 1-40 20l11-28z" fill={C.amber} />
        </Window>
        <g transform="rotate(-6 120 200)">
          <rect x="50" y="140" width="120" height="112" rx="14" fill={C.navy} />
          <rect x="62" y="152" width="96" height="30" rx="7" fill={C.mist} />
          <text x="148" y="174" textAnchor="end" fontFamily="Arial Black, Arial" fontSize="18" fontWeight="900" fill={C.navy}>3.62</text>
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={62 + c * 34} y={192 + r * 18} width="26" height="12" rx="4" fill={r === 2 && c === 2 ? C.amber : C.cobalt} opacity={r === 2 && c === 2 ? 1 : 0.85} />),
          )}
        </g>
        <g transform="translate(250 200)">
          <circle r="26" fill={C.amber} />
          <path d="M0-13l4 8 9 1.3-6.5 6.3 1.5 9-8-4.3-8 4.3 1.5-9-6.5-6.3 9-1.3z" fill={C.paper} />
        </g>
        <Leaf x={346} y={270} s={1.05} r={16} />
        <Leaf x={324} y={272} s={0.8} r={-12} dark />
        <Sparks x={112} y={34} r={-25} />
      </>
    ),
  },
  subjects: {
    title: 'Môn học và điều kiện',
    draw: () => (
      <>
        <Ribbon d="M-20 90C70 30 130 160 200 120S320 230 420 160" />
        <circle cx="358" cy="50" r="15" fill={C.leaf} />
        <circle cx="44" cy="234" r="12" fill={C.coral} />
        <Window x={64} y={36} w={272} h={168}>
          {[
            [30, 30, C.green],
            [30, 82, C.green],
            [120, 56, C.cobalt],
            [210, 30, C.amber],
            [210, 92, C.mist],
          ].map(([x, y, col], i) => (
            <g key={i}>
              <rect x={x as number} y={y as number} width="62" height="34" rx="9" fill={col as string} />
              <path d={`M${(x as number) + 12} ${(y as number) + 17}h30`} stroke={col === C.mist ? C.sky : C.paper} strokeWidth="5" strokeLinecap="round" opacity=".85" />
            </g>
          ))}
          <path d="M92 47C106 47 106 73 120 73M92 99C106 99 106 73 120 73M182 73C196 73 196 47 210 47M182 73C196 73 196 109 210 109" stroke={C.navy} strokeWidth="2.6" fill="none" strokeDasharray="0" />
          <g transform="translate(262 112)">
            <rect x="-11" y="-6" width="22" height="18" rx="4" fill={C.navy} />
            <path d="M-6-6v-5a6 6 0 0 1 12 0v5" stroke={C.navy} strokeWidth="3" fill="none" />
          </g>
        </Window>
        <g transform="translate(70 218) rotate(-4)">
          <rect width="150" height="42" rx="12" fill={C.paper} stroke={C.line} />
          <circle cx="22" cy="21" r="11" fill={C.green} />
          <path d="M16 21.5l4 4 7-8" stroke={C.paper} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Lines x={42} y={15} w={90} n={2} gap={12} />
        </g>
        <Books x={262} y={258} colors={[C.cobalt, C.amber, C.leafDark]} />
        <Leaf x={250} y={270} s={0.9} r={-22} />
        <Sparks x={60} y={44} r={-30} />
      </>
    ),
  },
  flashcards: {
    title: 'Thẻ ghi nhớ',
    draw: () => (
      <>
        <Ribbon d="M420 220C330 270 280 150 210 190S80 280 20 200-10 60 60 30" />
        <circle cx="356" cy="46" r="15" fill={C.leaf} />
        <circle cx="52" cy="244" r="11" fill={C.coral} />
        <g transform="rotate(-12 170 150)">
          <rect x="96" y="70" width="150" height="104" rx="14" fill={C.sky} />
        </g>
        <g transform="rotate(-5 180 140)">
          <rect x="104" y="64" width="150" height="104" rx="14" fill={C.cobalt} />
        </g>
        <g transform="rotate(4 200 130)">
          <rect x="118" y="52" width="164" height="118" rx="14" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <text x="134" y="80" fontFamily="Arial Black, Arial" fontSize="13" fontWeight="900" fill={C.navy}>Câu 12</text>
          <rect x="214" y="68" width="54" height="16" rx="8" fill={C.amber} />
          <text x="241" y="80" textAnchor="middle" fontFamily="Arial" fontSize="9.5" fontWeight="700" fill={C.ink}>Ra 3 lần</text>
          <Lines x={134} y={96} w={120} n={2} gap={11} />
          <rect x="134" y="124" width="58" height="16" rx="5" fill={C.mist} />
          <rect x="198" y="124" width="58" height="16" rx="5" fill="#E2F3EA" stroke={C.green} strokeWidth="1.5" />
          <Check x={232} y={124} />
          <rect x="134" y="146" width="58" height="16" rx="5" fill={C.mist} />
          <rect x="198" y="146" width="58" height="16" rx="5" fill={C.mist} />
        </g>
        <g transform="translate(300 150)">
          <circle r="30" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <path d="M0-30A30 30 0 1 1-26 15" stroke={C.green} strokeWidth="7" fill="none" strokeLinecap="round" />
          <text y="6" textAnchor="middle" fontFamily="Arial Black, Arial" fontSize="15" fontWeight="900" fill={C.navy}>78%</text>
        </g>
        <Books x={46} y={252} colors={[C.leafDark, C.cobalt, C.coral]} />
        <Leaf x={372} y={272} s={1.05} r={18} />
        <Leaf x={350} y={274} s={0.8} r={-10} dark />
        <Sparks x={290} y={56} r={20} />
      </>
    ),
  },
  lecturers: {
    title: 'Tra cứu giảng viên',
    draw: () => (
      <>
        <Ribbon d="M-10 60C80 0 130 120 200 90S330 10 410 90" />
        <circle cx="46" cy="232" r="14" fill={C.leaf} />
        <circle cx="360" cy="40" r="11" fill={C.coral} />
        <Window x={70} y={46} w={260} h={170} tilt={-2}>
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${16 + i * 122} 16)`}>
              <rect width="112" height="126" rx="12" fill={C.paper2} stroke={C.line} />
              <circle cx="56" cy="38" r="22" fill={i ? C.amber : C.sky} />
              <circle cx="56" cy="33" r="9" fill={C.paper} />
              <path d="M40 54a16 12 0 0 1 32 0" fill={C.paper} />
              <rect x="22" y="70" width="68" height="8" rx="4" fill={C.navy} opacity=".85" />
              <rect x="30" y="84" width="52" height="6" rx="3" fill={C.mist} />
              <rect x="26" y="100" width="60" height="16" rx="8" fill={i ? C.coral : C.cobalt} />
            </g>
          ))}
        </Window>
        <g transform="translate(296 196)">
          <circle r="34" fill={C.cobalt} />
          <circle cx="-4" cy="-4" r="13" fill="none" stroke={C.paper} strokeWidth="5" />
          <path d="M6 6l12 12" stroke={C.paper} strokeWidth="6" strokeLinecap="round" />
        </g>
        <Books x={96} y={262} colors={[C.coral, C.leafDark, C.cobalt]} />
        <Leaf x={64} y={270} s={1} r={-16} />
        <Sparks x={336} y={152} r={30} />
      </>
    ),
  },
  vec: {
    title: 'Phòng thi ảo',
    draw: () => (
      <>
        <Ribbon d="M410 70C320 0 280 140 200 110S60 20 20 120 80 270 160 250" />
        <circle cx="54" cy="46" r="14" fill={C.leaf} />
        <circle cx="364" cy="236" r="12" fill={C.coral} />
        <g transform="translate(92 40)">
          <rect x="4" y="6" width="216" height="140" rx="14" fill={C.navy} opacity=".14" />
          <rect width="216" height="140" rx="14" fill={C.ink} />
          <rect x="10" y="10" width="196" height="120" rx="8" fill={C.paper} />
          <rect x="22" y="22" width="90" height="10" rx="5" fill={C.navy} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="22" y={44 + i * 24} width="130" height="16" rx="5" fill={i === 1 ? '#E2F3EA' : C.mist} stroke={i === 1 ? C.green : 'none'} strokeWidth="1.5" />
              {i === 1 && <Check x={136} y={44 + i * 24} />}
            </g>
          ))}
          <circle cx="178" cy="62" r="20" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <path d="M178 42a20 20 0 1 1-19 26" stroke={C.cobalt} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M178 52v10l7 5" stroke={C.navy} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <rect x="88" y="140" width="40" height="16" fill={C.ink} />
          <rect x="62" y="154" width="92" height="10" rx="5" fill={C.ink} />
        </g>
        <g transform="translate(300 176)">
          <path d="M0-34l28 10v18c0 20-12 32-28 38-16-6-28-18-28-38v-18z" fill={C.green} />
          <path d="M-11 0l8 8 15-17" stroke={C.paper} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(36 186) rotate(-8)">
          <rect width="78" height="52" rx="10" fill={C.paper} stroke={C.line} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={8 + i * 17} y="14" width="13" height="24" rx="4" fill={i < 2 ? C.cobalt : C.mist} />
          ))}
        </g>
        <Leaf x={250} y={272} s={1} r={-14} />
        <Leaf x={272} y={274} s={0.8} r={16} dark />
        <Sparks x={318} y={128} r={24} />
      </>
    ),
  },
  timetable: {
    title: 'Thời khoá biểu',
    draw: () => (
      <>
        <Ribbon d="M-10 220C80 280 120 150 200 180S330 260 410 190" />
        <circle cx="356" cy="44" r="14" fill={C.leaf} />
        <circle cx="42" cy="54" r="11" fill={C.coral} />
        <Window x={74} y={34} w={252} h={176} tilt={2}>
          {Array.from({ length: 5 }, (_, c) =>
            Array.from({ length: 4 }, (_, r) => {
              const on = (c + r * 2) % 5 === 1 || (c === 3 && r === 0);
              const col = [C.cobalt, C.amber, C.coral, C.green][(c + r) % 4];
              return <rect key={`${c}${r}`} x={16 + c * 45} y={14 + r * 32} width="38" height="24" rx="6" fill={on ? col : C.paper2} stroke={on ? 'none' : C.line} />;
            }),
          )}
        </Window>
        <g transform="translate(300 196)">
          <circle r="30" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <circle r="22" fill={C.mist} />
          <path d="M0-14v14l10 7" stroke={C.navy} strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
        <Books x={60} y={258} colors={[C.cobalt, C.leafDark, C.amber]} />
        <Leaf x={364} y={272} s={1} r={14} />
        <Sparks x={284} y={146} r={-10} />
      </>
    ),
  },
  empty: {
    title: 'Chưa có gì ở đây',
    draw: () => (
      <>
        <Ribbon d="M-10 210C70 270 120 140 200 170S330 250 410 170" />
        <circle cx="352" cy="46" r="14" fill={C.leaf} />
        <circle cx="46" cy="58" r="11" fill={C.coral} />
        <Window x={84} y={40} w={232} h={160} tilt={-2}>
          <rect x="16" y="14" width="200" height="22" rx="11" fill={C.paper2} stroke={C.line} />
          <rect x="28" y="22" width="60" height="6" rx="3" fill={C.mist} />
          <rect x="16" y="50" width="200" height="72" rx="10" fill="none" stroke={C.sky} strokeWidth="2" strokeDasharray="7 6" />
          <path d="M100 86h32M116 70v32" stroke={C.sky} strokeWidth="4" strokeLinecap="round" opacity=".7" />
        </Window>
        <g transform="translate(290 178)">
          <circle r="34" fill={C.paper} stroke={C.cobalt} strokeWidth="9" />
          <path d="M-14-4a16 16 0 0 1 18-12" stroke={C.sky} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M25 25l28 28" stroke={C.cobalt} strokeWidth="13" strokeLinecap="round" />
        </g>
        <Books x={56} y={262} colors={[C.leafDark, C.amber, C.cobalt]} />
        <Leaf x={364} y={272} s={0.95} r={18} />
        <Leaf x={344} y={274} s={0.75} r={-10} dark />
        <Sparks x={250} y={130} r={-30} />
      </>
    ),
  },
  error: {
    title: 'Không tải được',
    draw: () => (
      <>
        <Ribbon d="M410 210C330 270 280 140 200 170S70 250-10 170" />
        <circle cx="50" cy="46" r="14" fill={C.leaf} />
        <circle cx="356" cy="50" r="11" fill={C.amber} />
        <Window x={84} y={36} w={232} h={150} tilt={2}>
          <g transform="translate(116 62)">
            <path d="M-46 22a24 24 0 0 1 6-46 34 34 0 0 1 64-6 26 26 0 0 1 24 52z" fill={C.mist} />
            <path d="M-12-6l24 24M12-6l-24 24" stroke={C.coral} strokeWidth="7" strokeLinecap="round" />
          </g>
        </Window>
        <g stroke={C.navy} strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M40 236c40 0 60-30 96-30" />
          <path d="M360 236c-40 0-60-30-96-30" />
        </g>
        <g transform="translate(146 206)">
          <rect x="-12" y="-14" width="26" height="28" rx="6" fill={C.cobalt} />
          <path d="M14-7h10M14 7h10" stroke={C.navy} strokeWidth="5" strokeLinecap="round" />
        </g>
        <g transform="translate(254 206)">
          <rect x="-14" y="-14" width="26" height="28" rx="6" fill={C.coral} />
        </g>
        <Sparks x={200} y={222} r={0} color={C.coral} />
        <Leaf x={40} y={274} s={0.95} r={-16} />
        <Leaf x={362} y={274} s={0.9} r={16} dark />
      </>
    ),
  },
  student: {
    title: 'Sinh viên vào phòng thi',
    draw: () => (
      <>
        <Ribbon d="M-10 80C70 20 130 150 200 120S320 30 410 110" />
        <circle cx="358" cy="236" r="14" fill={C.leaf} />
        <circle cx="44" cy="50" r="11" fill={C.coral} />
        <Window x={70} y={40} w={260} h={150} tilt={-2}>
          <text x="130" y="30" textAnchor="middle" fontFamily="Arial Black, Arial" fontSize="13" fontWeight="900" fill={C.navy}>Mã phòng thi</text>
          {['4', '8', '2', '0', '7', '1', ''].map((d, i) => (
            <g key={i}>
              <rect x={22 + i * 31} y="44" width="26" height="34" rx="7" fill={d ? C.paper : C.paper2} stroke={d ? C.cobalt : C.line} strokeWidth={d ? 2 : 1.5} />
              <text x={35 + i * 31} y="67" textAnchor="middle" fontFamily="Arial Black, Arial" fontSize="15" fontWeight="900" fill={C.navy}>{d}</text>
            </g>
          ))}
          <path d="M215 52v18" stroke={C.cobalt} strokeWidth="2.4" strokeLinecap="round" />
          <rect x="70" y="94" width="120" height="22" rx="11" fill={C.cobalt} />
          <text x="130" y="109" textAnchor="middle" fontFamily="Arial" fontSize="11" fontWeight="700" fill={C.paper}>Vào phòng chờ</text>
        </Window>
        <g transform="translate(46 186) rotate(-7)">
          <rect width="118" height="72" rx="12" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <rect width="118" height="18" rx="12" fill={C.cobalt} />
          <rect y="10" width="118" height="8" fill={C.cobalt} />
          <circle cx="28" cy="44" r="15" fill={C.sky} />
          <circle cx="28" cy="40" r="6" fill={C.paper} />
          <path d="M18 54a10 8 0 0 1 20 0" fill={C.paper} />
          <rect x="52" y="34" width="52" height="7" rx="3.5" fill={C.navy} opacity=".85" />
          <rect x="52" y="47" width="38" height="6" rx="3" fill={C.mist} />
        </g>
        <g transform="translate(300 186)">
          <path d="M0-26l36 14-36 14-36-14z" fill={C.navy} />
          <path d="M-20-5v14c0 6 40 6 40 0V-5L0 3z" fill={C.cobalt} />
          <path d="M32-11v18" stroke={C.amber} strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="9" r="4" fill={C.amber} />
        </g>
        <Leaf x={232} y={274} s={0.95} r={-14} />
        <Leaf x={254} y={276} s={0.75} r={16} dark />
        <Sparks x={346} y={40} r={20} />
      </>
    ),
  },
  lecturer: {
    title: 'Giảng viên quản lý phiên thi',
    draw: () => (
      <>
        <Ribbon d="M410 90C330 20 270 160 200 120S70 30-10 120" />
        <circle cx="46" cy="236" r="14" fill={C.leaf} />
        <circle cx="358" cy="44" r="11" fill={C.coral} />
        <Window x={64} y={36} w={272} h={170} tilt={2}>
          {[0, 1, 2, 3].map((i) => {
            const st = [C.green, C.green, C.amber, C.coral][i];
            return (
              <g key={i} transform={`translate(16 ${12 + i * 30})`}>
                <rect width="240" height="24" rx="7" fill={C.paper2} stroke={C.line} />
                <circle cx="14" cy="12" r="7" fill={[C.sky, C.amber, C.mist, C.sky][i]} />
                <rect x="28" y="8" width={70 - i * 6} height="8" rx="4" fill={C.navy} opacity=".8" />
                <rect x="120" y="9" width="70" height="6" rx="3" fill={C.mist} />
                <rect x="120" y="9" width={[64, 50, 30, 18][i]} height="6" rx="3" fill={C.cobalt} />
                <rect x="202" y="6" width="30" height="12" rx="6" fill={st} />
              </g>
            );
          })}
        </Window>
        <g transform="translate(70 198) rotate(-6)">
          <rect width="96" height="58" rx="12" fill={C.navy} />
          <text x="48" y="26" textAnchor="middle" fontFamily="Arial Black, Arial" fontSize="17" fontWeight="900" fill={C.paper}>8.75</text>
          <rect x="18" y="36" width="60" height="8" rx="4" fill={C.sky} />
        </g>
        <g transform="translate(300 214)">
          <rect x="-26" y="-30" width="52" height="60" rx="8" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <rect x="-12" y="-36" width="24" height="12" rx="4" fill={C.amber} />
          <Check x={-18} y={-14} />
          <rect x="2" y="-10" width="16" height="6" rx="3" fill={C.mist} />
          <Check x={-18} y={8} />
          <rect x="2" y="12" width="16" height="6" rx="3" fill={C.mist} />
        </g>
        <Leaf x={364} y={276} s={0.95} r={16} />
        <Sparks x={52} y={52} r={-24} />
      </>
    ),
  },
  fe: {
    title: 'FE – Trắc nghiệm',
    draw: () => (
      <>
        <Ribbon d="M-10 220C70 280 130 150 210 180S330 250 410 160" />
        <circle cx="356" cy="44" r="14" fill={C.leaf} />
        <circle cx="44" cy="52" r="11" fill={C.coral} />
        <g transform="rotate(-4 200 130)">
          <rect x="110" y="34" width="180" height="200" rx="14" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <rect x="128" y="52" width="110" height="10" rx="5" fill={C.navy} opacity=".85" />
          {[0, 1, 2, 3, 4].map((r) => (
            <g key={r}>
              <text x="130" y={92 + r * 28} fontFamily="Arial Black, Arial" fontSize="11" fontWeight="900" fill={C.navy}>{r + 1}</text>
              {['A', 'B', 'C', 'D'].map((l, c) => {
                const on = [1, 3, 0, 2, 1][r] === c;
                return <circle key={l} cx={160 + c * 30} cy={88 + r * 28} r="9" fill={on ? C.cobalt : C.paper} stroke={on ? C.cobalt : C.line} strokeWidth="2" />;
              })}
            </g>
          ))}
        </g>
        <g transform="translate(318 186)">
          <circle r="30" fill={C.green} />
          <path d="M-12 0l8 8 16-17" stroke={C.paper} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(60 196) rotate(-10)">
          <rect x="-8" y="-40" width="16" height="70" rx="4" fill={C.amber} />
          <path d="M-8 30h16l-8 16z" fill="#F6D7A0" />
          <path d="M-3 42h6l-3 6z" fill={C.ink} />
          <rect x="-8" y="-46" width="16" height="10" rx="3" fill={C.coral} />
        </g>
        <Leaf x={364} y={274} s={0.9} r={16} dark />
        <Sparks x={300} y={56} r={20} />
      </>
    ),
  },
  pe: {
    title: 'PE – Thực hành',
    draw: () => (
      <>
        <Ribbon d="M410 220C330 280 270 150 190 180S70 250-10 160" />
        <circle cx="46" cy="44" r="14" fill={C.leaf} />
        <circle cx="358" cy="56" r="11" fill={C.coral} />
        <g transform="translate(76 38)">
          <rect x="4" y="6" width="220" height="150" rx="12" fill={C.navy} opacity=".14" />
          <rect width="220" height="150" rx="12" fill={C.ink} />
          <circle cx="14" cy="12" r="3.6" fill={C.coral} />
          <circle cx="25" cy="12" r="3.6" fill={C.amber} />
          <circle cx="36" cy="12" r="3.6" fill={C.leaf} />
          {[
            [16, 40, 40, C.sky],
            [60, 40, 70, C.amber],
            [28, 58, 90, C.mist],
            [28, 76, 60, '#7FD1A8'],
            [92, 76, 50, C.sky],
            [28, 94, 110, C.mist],
            [16, 112, 30, C.sky],
          ].map(([x, y, w, col], i) => (
            <rect key={i} x={x as number} y={y as number} width={w as number} height="8" rx="4" fill={col as string} opacity=".9" />
          ))}
          <rect x="150" y="104" width="3" height="16" fill={C.paper} />
        </g>
        <g transform="translate(300 176)">
          <rect x="-34" y="-30" width="68" height="76" rx="10" fill={C.paper} stroke={C.line} strokeWidth="1.5" />
          <rect x="-34" y="-30" width="68" height="20" rx="10" fill={C.amber} />
          <text y="-15" textAnchor="middle" fontFamily="Arial Black, Arial" fontSize="10" fontWeight="900" fill={C.ink}>.ZIP</text>
          <circle cy="16" r="16" fill={C.cobalt} />
          <path d="M0 24V8m-7 6 7-7 7 7" stroke={C.paper} strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <Books x={60} y={258} colors={[C.cobalt, C.coral, C.leafDark]} />
        <Leaf x={364} y={276} s={0.95} r={16} />
        <Sparks x={262} y={44} r={20} />
      </>
    ),
  },
};

export function ToolArt({ name, className }: { name: ToolArtName; className?: string }) {
  const scene = SCENES[name];
  return (
    <span className={className} aria-hidden>
      <Frame title={scene.title}>{scene.draw()}</Frame>
    </span>
  );
}
