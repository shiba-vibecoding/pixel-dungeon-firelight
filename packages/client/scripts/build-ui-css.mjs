// Builds packages/client/src/ui.css from the design system: tokens.json -> CSS variables,
// then bundle.css with the big atlases pointed at the game's own files.
import { readFileSync, writeFileSync } from 'node:fs';

// Usage: node packages/client/scripts/build-ui-css.mjs [designDir] [out]
const [designDir = 'docs/design/system', out = 'packages/client/src/ui.css'] = process.argv.slice(2);
const tokens = JSON.parse(readFileSync(`${designDir}/tokens.json`, 'utf8'));
let bundle = readFileSync(`${designDir}/components/bundle.css`, 'utf8');

const vars = [];
const colors = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
for (const t of tokens.color.tokens) {
  const ref = /^\{(.+)\}$/.exec(t.value);
  vars.push(`  --${t.name}: ${ref ? `var(--${ref[1]})` : t.value};`);
}
vars.push(`  --font-ui: ${tokens.type.families.ui};`);
vars.push(`  --font-small: ${tokens.type.families.small};`);
for (const group of tokens.type.groups) {
  for (const s of group.styles) {
    vars.push(`  --text-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${group.family});`);
  }
}
for (const section of ['spacing', 'radius', 'size', 'shadow', 'zIndex']) {
  for (const t of tokens[section].tokens) vars.push(`  --${t.name}: ${t.value};`);
}
void colors;

// The game serves these itself; no need to inline them.
const own = {
  '--atlas-items': 'url("/assets/items.png")',
  '--atlas-buffs': 'url("/assets/buffs.png")',
  '--atlas-badges': 'url("/assets/badges.png")',
  '--spr-window': 'url("/assets/ui-window.png")',
  '--spr-toast': 'url("/assets/ui-toast.png")',
};
for (const [name, value] of Object.entries(own)) {
  const re = new RegExp(`(\\n\\s*${name}:\\s*)url\\("data:[^"]*"\\)`);
  if (!re.test(bundle)) throw new Error(`no ${name}`);
  bundle = bundle.replace(re, `$1${value}`);
}

const head = `/*
 * Pixel Dungeon UI: the design system made in Claude Design (docs/design/system),
 * tokens first, then its components. Galmuri by Lee Minseo, SIL OFL 1.1 (public/fonts/OFL.txt).
 * Generated from the design system's tokens.json and bundle.css; game-specific
 * additions live in game.css.
 */

@font-face { font-family: "Galmuri11"; src: url("/fonts/Galmuri11.woff2") format("woff2"); font-display: block; }
@font-face { font-family: "Galmuri9"; src: url("/fonts/Galmuri9.woff2") format("woff2"); font-display: block; }

:root {
${vars.join('\n')}
}

`;
writeFileSync(out, head + bundle);
console.log('wrote', out, (head + bundle).length);
