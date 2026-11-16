// Runs before `npm run dev`. Stops Kaned dev servers left over from an earlier
// run (a terminal that was not closed, a crashed watcher) so the API gets port
// 4000 and the web app gets 5173 instead of drifting to 5174, 5175...
//
// Only node processes started from this folder are touched. Anything else on
// those ports is reported and left alone.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

function apiPort() {
  const env = path.join(ROOT, 'apps', 'api', '.env');
  if (!existsSync(env)) return 4000;
  const m = readFileSync(env, 'utf8').match(/^\s*PORT\s*=\s*"?(\d+)"?/m);
  return m ? Number(m[1]) : 4000;
}

// The API port, the web port, and the ports Vite drifts to when 5173 is taken.
const PORTS = [apiPort(), 5173, 5174, 5175, 5176, 5177, 5178, 5179];

const norm = (s) => (s ?? '').replace(/\\/g, '/').toLowerCase();
const rootKey = norm(ROOT).replace(/\/+$/, '') + '/';
const fromThisRepo = (p) => p && norm(p.cmd).includes(rootKey);

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  } catch (e) {
    return typeof e.stdout === 'string' ? e.stdout : '';
  }
}

/** Map of port -> pid for listening TCP sockets on the given ports. */
export function parseNetstat(out, ports) {
  const found = new Map();
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    // "TCP  0.0.0.0:4000  0.0.0.0:0  LISTENING  21384" — the state word is
    // localised on some Windows installs, so go by the foreign address instead.
    if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue;
    const [, local, foreign] = parts;
    if (!/:0$/.test(foreign) && foreign !== '*:*') continue;
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    const pid = Number(parts[parts.length - 1]);
    if (ports.includes(port) && pid > 0 && !found.has(port)) found.set(port, pid);
  }
  return found;
}

function listeners() {
  if (isWin) return parseNetstat(run('netstat', ['-ano']), PORTS);
  const found = new Map();
  for (const port of PORTS) {
    const pid = Number(run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).trim().split('\n')[0]);
    if (pid > 0) found.set(port, pid);
  }
  return found;
}

/** pid -> { pid, ppid, name, cmd } */
function processes() {
  const map = new Map();
  if (isWin) {
    const script =
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
    let rows = [];
    try {
      rows = JSON.parse(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]) || '[]');
    } catch {
      rows = [];
    }
    for (const r of Array.isArray(rows) ? rows : [rows]) {
      map.set(r.ProcessId, { pid: r.ProcessId, ppid: r.ParentProcessId, name: String(r.Name ?? ''), cmd: r.CommandLine ?? '' });
    }
    return map;
  }
  for (const line of run('ps', ['-axo', 'pid=,ppid=,comm=,args=']).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (m) map.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), name: path.basename(m[3]), cmd: m[4] });
  }
  return map;
}

const isNode = (p) => /^node(\.exe)?$/i.test(p?.name ?? '');

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

async function main() {
  const held = listeners();
  if (held.size === 0) return;

  const procs = processes();
  // Never stop the npm process that is running this script, or its parents.
  const mine = new Set();
  for (let p = procs.get(process.pid) ?? { pid: process.pid, ppid: process.ppid }; p; p = procs.get(p.ppid)) {
    if (mine.has(p.pid)) break;
    mine.add(p.pid);
  }

  const targets = new Map(); // top pid -> ports
  for (const [port, pid] of held) {
    const proc = procs.get(pid);
    if (!isNode(proc) || !fromThisRepo(proc) || mine.has(pid)) {
      const who = proc ? `${proc.name} (PID ${pid})` : `PID ${pid}`;
      console.warn(`  [!] Cong ${port} dang bi ${who} dung - khong phai server Kaned nen khong tat.`);
      continue;
    }
    // Climb to the outermost Kaned process (tsx watch, npm-run-all) so the
    // watcher does not restart the server right after it is stopped.
    let top = proc;
    for (let up = procs.get(top.ppid); isNode(up) && fromThisRepo(up) && !mine.has(up.pid); up = procs.get(up.ppid)) top = up;
    targets.set(top.pid, [...(targets.get(top.pid) ?? []), port]);
  }

  for (const [pid, ports] of targets) {
    if (isWin) run('taskkill', ['/PID', String(pid), '/T', '/F']);
    else {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
      for (const port of ports) {
        const child = held.get(port);
        try {
          if (child !== pid) process.kill(child, 'SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }
    console.log(`  Da tat server Kaned cu dang giu cong ${ports.join(', ')} (PID ${pid}).`);
  }

  if (targets.size === 0) return;
  const wanted = [...targets.values()].flat();
  for (let i = 0; i < 20; i++) {
    const free = await Promise.all(wanted.map(portFree));
    if (free.every(Boolean)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    // Never block `npm run dev` because of this helper.
    console.warn('  [!] Khong kiem tra duoc cong cu:', e?.message ?? e);
  });
}
