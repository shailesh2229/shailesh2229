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
const H = 320;
const CELL = 16.4;
const GAP = 4.75;
const X0 = 40;
const Y0 = 64;

function svg(days, s, t) {
  // GitHub's calendar starts on a Sunday column; place each day by weekday / week index
  const first = new Date(days[0].date + "T00:00:00Z");
  const offset = first.getUTCDay();
  const cols = Math.ceil((days.length + offset) / 7);
  const cells = days
    .map((d, i) => {
      const k = i + offset;
      const c = Math.floor(k / 7);
      const r = k % 7;
      const fill = d.level ? t.levels[d.level - 1] : t.empty;
      return `<rect class="c c${c}" x="${(X0 + c * (CELL + GAP)).toFixed(1)}" y="${(Y0 + r * (CELL + GAP)).toFixed(1)}" width="${CELL}" height="${CELL}" rx="3.5" fill="${fill}"><title>${d.count} on ${d.date}</title></rect>`;
    })
    .join("");
  const last = days.length - 1 + offset;
  const lx = X0 + Math.floor(last / 7) * (CELL + GAP) + CELL / 2;
  const ly = Y0 + (last % 7) * (CELL + GAP) + CELL / 2;
  const delays = Array.from({ length: cols }, (_, c) => `.c${c}{animation-delay:${(c * 0.028).toFixed(3)}s}`).join("");
  const gridW = cols * (CELL + GAP) - GAP;
  const fmt = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const stat = (x, n, label) =>
    `<text x="${x}" y="266" class="big">${n}</text><text x="${x}" y="292" class="m">${label}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${s.total} GitHub contributions in the last year">
<style>
.m{font:400 12px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;fill:${t.muted}}
.big{font:700 34px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.03em;fill:${t.fg}}
.c{animation:in .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
${delays}
.scan{fill:${t.levels[3]};opacity:0;animation:scan 7s 1.8s ease-in-out infinite}
@keyframes scan{0%{opacity:0;transform:translateX(0)}8%{opacity:.18}92%{opacity:.18}100%{opacity:0;transform:translateX(${gridW}px)}}
.p{fill:none;stroke:${t.levels[3]};stroke-width:1.5;transform-origin:${lx}px ${ly}px;animation:ring 2.2s 1.6s ease-out infinite both}
@keyframes ring{from{transform:scale(.6);opacity:1}to{transform:scale(2.4);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.scan{display:none}}
</style>
<rect width="${W}" height="${H}" rx="22" fill="${t.bg}"/>
<text x="${X0}" y="40" class="m">ACTIVITY · LAST 12 MONTHS</text>
<text x="${W - 40}" y="40" class="m" text-anchor="end">UPDATED ${fmt(days[days.length - 1].date).toUpperCase()}</text>
${cells}
<rect class="scan" x="${X0 - 3}" y="${Y0 - 6}" width="6" height="${7 * (CELL + GAP) + 7}" rx="3"/>
<circle class="p" cx="${lx}" cy="${ly}" r="9"/>
<line x1="40" x2="${W - 40}" y1="${Y0 + 7 * (CELL + GAP) + 10}" y2="${Y0 + 7 * (CELL + GAP) + 10}" stroke="${t.line}"/>
${[
    [s.total, "CONTRIBUTIONS"],
    // a zero streak says nothing useful, so it only shows while one is running
    ...(s.current > 0 ? [[`${s.current}d`, "CURRENT STREAK"]] : []),
    [`${s.longest}d`, "LONGEST STREAK"],
    [s.best.count, `BEST DAY · ${fmt(s.best.date).toUpperCase()}`],
  ]
    .map(([n, label], i) => stat(40 + i * 260, n, label))
    .join("")}
<text x="${W - 40}" y="292" class="m" text-anchor="end">ONE MORE IDEA →</text>
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
