// Builds assets/activity-dark.svg and assets/activity-light.svg from the public GitHub contribution calendar.
// Runs every day in .github/workflows/activity.yml (no token needed — it reads the public calendar).
// Run locally: node scripts/activity.mjs [username]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USER = process.argv[2] || process.env.GH_USER || "shailesh2229";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const THEMES = {
  dark: { bg: "#0b0b0a", fg: "#ece9e0", muted: "#9a968a", empty: "#1c1c19", levels: ["#3d4a14", "#6f8a1e", "#a6d12c", "#c8ff3d"], line: "rgba(236,233,224,.16)" },
  light: { bg: "#ece9e1", fg: "#10100e", muted: "#5f5b52", empty: "#dcd8cc", levels: ["#b9c0f2", "#8592ec", "#5867e6", "#3a4be0"], line: "rgba(16,16,14,.16)" },
};

async function calendar() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { "User-Agent": "profile-activity-script" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const html = await res.text();
  const days = [];
  const cell = /data-date="(\d{4}-\d{2}-\d{2})"\s+id="([^"]+)"[^>]*data-level="(\d)"/g;
  for (let m; (m = cell.exec(html)); ) days.push({ date: m[1], id: m[2], level: +m[3], count: 0 });
  const byId = new Map(days.map((d) => [d.id, d]));
  const tip = /<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  for (let m; (m = tip.exec(html)); ) {
    const d = byId.get(m[1]);
    const n = /^(\d[\d,]*) contribution/.exec(m[2]);
    if (d && n) d.count = +n[1].replace(/,/g, "");
  }
  if (!days.length) throw new Error("no contribution cells found — GitHub may have changed the page");
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function stats(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // current streak: today may still be empty, so start from yesterday in that case
  let current = 0;
  let i = days.length - 1;
  if (days[i] && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) current++;
  const best = days.reduce((a, d) => (d.count > a.count ? d : a), days[0]);
  return { total, longest, current, best };
}

const W = 1200;
const H = 340;
const CELL = 16.4;
const GAP = 4.75;
const X0 = 40;
const Y0 = 64;
const PITCH = CELL + GAP;
const STEP = 0.11; // seconds per snake move
const SNAKE = [1, 0.8, 0.64, 0.5]; // head first, each segment a bit smaller

/**
 * The snake: starts off the left edge, always heads for the nearest uneaten square
 * (across, then up/down), eats anything it crosses, then leaves on the right.
 */
function snake(targets, cols) {
  const left = new Map(targets.map((t) => [`${t.c},${t.r}`, t]));
  let cur = { c: -3, r: 3 };
  const path = [cur];
  const eats = [];
  const step = (c, r) => {
    cur = { c, r };
    path.push(cur);
    const hit = left.get(`${c},${r}`);
    if (hit) {
      left.delete(`${c},${r}`);
      eats.push({ i: hit.i, at: path.length - 1 });
    }
  };
  while (left.size) {
    let t = null;
    for (const x of left.values()) if (!t || Math.abs(x.c - cur.c) + Math.abs(x.r - cur.r) < Math.abs(t.c - cur.c) + Math.abs(t.r - cur.r)) t = x;
    while (cur.c !== t.c) step(cur.c + Math.sign(t.c - cur.c), cur.r);
    while (cur.r !== t.r) step(cur.c, cur.r + Math.sign(t.r - cur.r));
  }
  while (cur.c < cols + SNAKE.length + 2) step(cur.c + 1, cur.r);
  return { path, eats };
}

function svg(days, s, t) {
  // GitHub's calendar starts on a Sunday column; place each day by weekday / week index
  const first = new Date(days[0].date + "T00:00:00Z");
  const offset = first.getUTCDay();
  const cols = Math.ceil((days.length + offset) / 7);
  const pos = days.map((d, i) => ({ c: Math.floor((i + offset) / 7), r: (i + offset) % 7, i, d }));
  const { path, eats } = snake(pos.filter((p) => p.d.level > 0), cols);
  const N = path.length - 1;
  const dur = +(N * STEP + 1.2).toFixed(2);
  const pct = (stepIdx) => ((stepIdx * STEP) / dur) * 100;
  const cx = (c) => X0 + c * PITCH + CELL / 2;
  const cy = (r) => Y0 + r * PITCH + CELL / 2;
  const f = (n) => +n.toFixed(3);
  const eatenAt = new Map(eats.map((e) => [e.i, e.at]));

  const cells = pos
    .map(({ c, r, i, d }) => {
      const fill = d.level ? t.levels[d.level - 1] : t.empty;
      const eat = eatenAt.has(i) ? ` style="animation:e${i} ${dur}s 1.4s linear infinite"` : "";
      return `<rect x="${(X0 + c * PITCH).toFixed(1)}" y="${(Y0 + r * PITCH).toFixed(1)}" width="${CELL}" height="${CELL}" rx="3.5" fill="${fill}"${eat}><title>${d.count} on ${d.date}</title></rect>`;
    })
    .join("");
  const eatKeys = eats
    .map(({ i, at }) => {
      const p = f(pct(at));
      return `@keyframes e${i}{0%,${p}%{fill:${t.levels[days[i].level - 1]}}${f(p + 0.05)}%,99.9%{fill:${t.empty}}}`;
    })
    .join("");

  // only the corners of the path need keyframes; the snake glides in straight lines between them
  const corners = [0];
  for (let j = 1; j < N; j++) {
    const a = path[j - 1], b = path[j], c = path[j + 1];
    if (b.c - a.c !== c.c - b.c || b.r - a.r !== c.r - b.r) corners.push(j);
  }
  corners.push(N);
  const segKeys = SNAKE.map((_, k) => {
    const frames = [`0%{transform:translate(${cx(path[0].c)}px,${cy(path[0].r)}px)}`];
    for (const j of corners) {
      const at = j + k;
      if (at > N) break;
      frames.push(`${f(pct(at))}%{transform:translate(${f(cx(path[j].c))}px,${f(cy(path[j].r))}px)}`);
    }
    return `@keyframes s${k}{${frames.join("")}100%{transform:translate(${f(cx(path[N - k].c))}px,${f(cy(path[N - k].r))}px)}}`;
  }).join("");
  const segs = SNAKE.map((m, k) => {
    const w = f(CELL * m);
    return `<rect class="sn" x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w}" rx="${f(3.5 * m + 0.5)}" style="animation:s${k} ${dur}s 1.4s linear infinite both;opacity:${1 - k * 0.14}"/>`;
  })
    .reverse()
    .join("");

  // progress bar: grows a notch with every square eaten
  const gridW = cols * PITCH - GAP;
  const barY = Y0 + 7 * PITCH + 8;
  const barKeys = `@keyframes bar{0%{transform:scaleX(0)}${eats
    .map((e, n) => `${f(pct(e.at))}%{transform:scaleX(${f(n / eats.length)})}${f(pct(e.at) + 0.05)}%{transform:scaleX(${f((n + 1) / eats.length)})}`)
    .join("")}99.9%{transform:scaleX(1)}100%{transform:scaleX(0)}}`;

  const last = days.length - 1 + offset;
  const lx = cx(Math.floor(last / 7));
  const ly = cy(last % 7);
  const fmt = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const stat = (x, n, label) => `<text x="${x}" y="286" class="big">${n}</text><text x="${x}" y="312" class="m">${label}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${s.total} GitHub contributions in the last year, eaten by a snake">
<style>
.m{font:400 12px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;fill:${t.muted}}
.big{font:700 34px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.03em;fill:${t.fg}}
.sn{fill:${t.levels[3]}}
.bar{fill:${t.levels[3]};transform-origin:${X0}px 0;animation:bar ${dur}s 1.4s linear infinite both}
.p{fill:none;stroke:${t.levels[3]};stroke-width:1.5;transform-origin:${lx}px ${ly}px;animation:ring 2.2s 1.6s ease-out infinite both}
@keyframes ring{from{transform:scale(.6);opacity:1}to{transform:scale(2.4);opacity:0}}
${eatKeys}${segKeys}${barKeys}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.sn{display:none}}
</style>
<defs><clipPath id="g"><rect x="${X0 - 2}" y="${Y0 - 4}" width="${f(gridW + 4)}" height="${f(7 * PITCH + 4)}"/></clipPath></defs>
<rect width="${W}" height="${H}" rx="22" fill="${t.bg}"/>
<text x="${X0}" y="40" class="m">ACTIVITY · LAST 12 MONTHS</text>
<text x="${W - 40}" y="40" class="m" text-anchor="end">UPDATED ${fmt(days[days.length - 1].date).toUpperCase()}</text>
${cells}
<circle class="p" cx="${lx}" cy="${ly}" r="9"/>
<g clip-path="url(#g)">${segs}</g>
<rect x="${X0}" y="${barY}" width="${f(gridW)}" height="5" rx="2.5" fill="${t.empty}"/>
<rect class="bar" x="${X0}" y="${barY}" width="${f(gridW)}" height="5" rx="2.5"/>
<line x1="40" x2="${W - 40}" y1="${barY + 22}" y2="${barY + 22}" stroke="${t.line}"/>
${[
    [s.total, "CONTRIBUTIONS"],
    // a zero streak says nothing useful, so it only shows while one is running
    ...(s.current > 0 ? [[`${s.current}d`, "CURRENT STREAK"]] : []),
    [`${s.longest}d`, "LONGEST STREAK"],
    [s.best.count, `BEST DAY · ${fmt(s.best.date).toUpperCase()}`],
  ]
    .map(([n, label], i) => stat(40 + i * 260, n, label))
    .join("")}
<text x="${W - 40}" y="312" class="m" text-anchor="end">ONE MORE IDEA →</text>
</svg>`;
}

const days = await calendar();
const s = stats(days);
for (const [name, t] of Object.entries(THEMES)) {
  const file = join(root, `assets/activity-${name}.svg`);
  writeFileSync(file, svg(days, s, t));
  console.log("wrote", file);
}
console.log(`${USER}: ${s.total} contributions, current streak ${s.current}, longest ${s.longest}`);
