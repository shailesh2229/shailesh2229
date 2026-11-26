// Builds assets/banner-dark.svg and assets/banner-light.svg — the animated name banner at the top of the README.
// Run: node scripts/banner.mjs   (no dependencies; fonts are embedded so GitHub renders them exactly)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const font = (f) => readFileSync(join(root, "scripts/fonts", f)).toString("base64");
const FONTS = `
@font-face{font-family:B;src:url(data:font/woff2;base64,${font("Bricolage.woff2")}) format("woff2");font-weight:200 800}
@font-face{font-family:S;font-style:italic;src:url(data:font/woff2;base64,${font("InstrumentSerif-Italic.woff2")}) format("woff2")}
@font-face{font-family:M;src:url(data:font/woff2;base64,${font("DMMono-Regular.woff2")}) format("woff2")}`;

const THEMES = {
  dark: { bg: "#0b0b0a", fg: "#ece9e0", muted: "#9a968a", accent: "#c8ff3d", line: "rgba(236,233,224,.16)" },
  light: { bg: "#ece9e1", fg: "#10100e", muted: "#5f5b52", accent: "#3a4be0", line: "rgba(16,16,14,.16)" },
};

const W = 1200;
const H = 460;
const STEP = 15;
const BANDS = 8;

/** halftone field: dots swell toward the top-right, fade out behind the name */
function dots() {
  const out = Array.from({ length: BANDS }, () => []);
  for (let y = STEP; y < H; y += STEP) {
    for (let x = STEP; x < W; x += STEP) {
      const dx = (x - 1010) / 520;
      const dy = (y - 90) / 360;
      const d = Math.sqrt(dx * dx + dy * dy);
      const wave = 0.5 + 0.5 * Math.sin(x / 47 + y / 31);
      let r = (1 - d) * 5.4 * (0.7 + 0.3 * wave);
      if (r < 0.7) continue;
      r = Math.min(r, 6.2);
      const band = Math.floor(((x / W) * 0.7 + (y / H) * 0.3) * BANDS) % BANDS;
      out[band].push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}"/>`);
    }
  }
  return out.map((c, i) => `<g class="b" style="animation-delay:${(i * 0.35).toFixed(2)}s">${c.join("")}</g>`).join("");
}

function svg(t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Shailesh Chaudhary — Designer and Developer, Ahmedabad, India">
<style>${FONTS}
.m{font:400 13px M,ui-monospace,monospace;letter-spacing:.14em;fill:${t.muted}}
.n{font:700 172px B,system-ui,sans-serif;letter-spacing:-.045em;fill:${t.fg}}
.s{font:400 178px S,Georgia,serif;font-style:italic;letter-spacing:-.02em;fill:${t.fg}}
.b{fill:${t.fg};opacity:.12;animation:w 5.6s ease-in-out infinite}
@keyframes w{0%,100%{opacity:.1}50%{opacity:.5}}
.r1,.r2{animation:up 1.1s cubic-bezier(.2,.8,.1,1) both}
.r2{animation-delay:.18s}
@keyframes up{from{transform:translateY(190px)}to{transform:none}}
.f{animation:fade .9s .7s ease both}
@keyframes fade{from{opacity:0}to{opacity:1}}
.p{fill:${t.accent};animation:pulse 2.4s 1.2s ease-in-out infinite both;transform-origin:1112px 352px}
.ring{fill:none;stroke:${t.accent};stroke-width:1.5;animation:ring 2.4s 1.2s ease-out infinite both;transform-origin:1112px 352px}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(.8)}}
@keyframes ring{0%{transform:scale(1);opacity:.9}100%{transform:scale(3.2);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.b{opacity:.3}}
</style>
<defs>
<clipPath id="c1"><rect x="0" y="70" width="${W}" height="168"/></clipPath>
<clipPath id="c2"><rect x="0" y="238" width="${W}" height="${H - 238}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" rx="22" fill="${t.bg}"/>
${dots()}
<g class="f">
<circle cx="52" cy="44" r="4" fill="${t.accent}"/>
<text class="m" x="66" y="48">WWW.WEBSK.DEV</text>
<text class="m" x="${W - 40}" y="48" text-anchor="end">DESIGN / CODE / PULSE</text>
</g>
<g clip-path="url(#c1)"><text class="n r1" x="36" y="222">SHAILESH</text></g>
<g clip-path="url(#c2)"><text class="s r2" x="356" y="372">Chaudhary</text></g>
<circle class="ring" cx="1112" cy="352" r="11"/>
<circle class="p" cx="1112" cy="352" r="11"/>
<g class="f">
<line x1="40" x2="${W - 40}" y1="404" y2="404" stroke="${t.line}"/>
<text class="m" x="40" y="432">DESIGNER &amp; DEVELOPER · B.TECH CSE '29</text>
<text class="m" x="${W - 40}" y="432" text-anchor="end">AHMEDABAD, INDIA</text>
</g>
</svg>`;
}

for (const [name, t] of Object.entries(THEMES)) {
  const file = join(root, `assets/banner-${name}.svg`);
  writeFileSync(file, svg(t));
  console.log("wrote", file);
}
