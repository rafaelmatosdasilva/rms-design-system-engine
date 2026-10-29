// token-jobs.mjs - a colour token's job, read from the components that use it.
//
// A token named for one job (a decorative border, a divider) is often also the border by which a control shows it can
// be clicked: an input's outline, a secondary button's edge. Decorative borders need no contrast; a control's boundary
// does, 3:1 against what it sits on (WCAG 1.4.11), so the same value can be fine in one place and fail in the other,
// and no check on the name alone sees it. This reads each component's own rules (its class and its states, in the
// system's CSS and each component file's <style>) and the tokens its borders and outlines use: a token a control uses
// is held at 3:1 against the control's own background, else the page's; one a control and something decorative both
// use is named as one token doing two jobs, with a control border of its own proposed. Advisory: never imposed, a
// layer is never added, and a team may keep one token on purpose. Pure.
import { walkCss, blankComments, styleBlocksOf } from './css-source.mjs';
import { parseColor } from './css-values.mjs';
import { customProps } from './motion-components.mjs';

// A component a person operates: what its name says it is.
export const CONTROL = /(button|input|checkbox|radio|switch|toggle|select|dropdown|drop-down|chip|segment|search|textarea|slider|stepper|field|picker|otp|tab(?!le))/i;
const EDGE = /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?)$/;
const BACKGROUND = /^background(-color)?$/;

// The CSS a component file carries (a .vue or .svelte file's <style> blocks), or the sheet itself.
export const cssOf = (file, text) => (/\.(vue|svelte|html?)$/i.test(file) ? String(styleBlocksOf(text)) : text);

const lum = ([r, g, b]) => { const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };

// What a control sits on when nothing says: the system's own page background, by its token's name (app or page
// background, canvas), else white.
export function pageBackground(resolve, names = []) {
  const seen = (x) => { const c = parseColor(resolve(`var(${x})`)); return c && (c[3] ?? 1) > 0; };
  const n = names.filter((x) => /(?:^--|-)(?:(?:app|page)[-_]?background|canvas)(?![a-z])/i.test(x) && seen(x)).sort((p, q) => /app/i.test(q) - /app/i.test(p))[0];
  return n ? resolve(`var(${n})`) : '#ffffff';
}

// sources: [{ file, text }] (CSS already, cssOf for a component file); comps: [{ name, cls }]; page: what a control sits
// on, as CSS (pageBackground when not given). A boundary is any edge a person sees: a control passes when its border or
// its own fill reaches 3:1 against the page, as WCAG 1.4.11 asks of the boundary, not of the border alone. A disabled
// control is exempt. → [{ var, controls: [{ name, state, border, fill }], others: [name], low: [same] }], a row for each
// token a control's border or outline uses; border and fill are each one's ratio against the page (fill null: none).
export function tokenJobs(sources = [], comps = [], { page = null } = {}) {
  const rules = sources.flatMap((s) => walkCss(blankComments(String(s.text ?? '')), s.file));
  const resolve = customProps(sources);
  const names = [...new Set(rules.flatMap((r) => r.decls.filter((d) => d.prop.startsWith('--')).map((d) => d.prop)))];
  const back = parseColor(resolve(page ?? pageBackground(resolve, names))) ?? [255, 255, 255, 1];
  const inactive = (x) => /disabled|inactive/i.test(x);
  const uses = new Map();   // --var → { controls: Map(name|state → { name, state, fill }), others: Set }
  const at = (v) => { if (!uses.has(v)) uses.set(v, { controls: new Map(), others: new Set() }); return uses.get(v); };
  for (const c of comps) {
    const cls = String(c.cls ?? '').replace(/^\./, '');
    if (!cls || /[^\w-]/.test(cls)) continue;
    const own = new RegExp(`^\\.${cls.replace(/-/g, '\\-')}(?![\\w-])[^\\s>+~]*$`);   // the class, alone or in a state (:hover, .is-open)
    const mine = rules.filter((r) => (r.atRules ?? []).every((a) => !/@keyframes|print/.test(a)) && r.selectors.some((s) => own.test(s.trim())));
    const fillIn = (r) => r?.decls.find((d) => BACKGROUND.test(d.prop) && /var\(/.test(d.value))?.value ?? null;
    const rest = mine.find((r) => r.selectors.some((s) => s.trim() === `.${cls}`));
    const control = CONTROL.test(c.name);
    for (const r of mine) {
      const sel = r.selectors.find((s) => own.test(s.trim())).trim();
      if (inactive(sel)) continue;
      for (const d of r.decls) {
        if (!EDGE.test(d.prop)) continue;
        for (const m of String(d.value).matchAll(/var\(\s*(--[\w-]+)/g)) {
          if (inactive(m[1])) continue;
          if (!control) { at(m[1]).others.add(c.name); continue; }
          const state = sel.slice(cls.length + 1) || 'at rest', key = `${c.name}|${state}`;
          if (!at(m[1]).controls.has(key)) at(m[1]).controls.set(key, { name: c.name, state, fill: fillIn(r) ?? fillIn(rest) });
        }
      }
    }
  }
  const rows = [];
  const vs = (css) => { const x = css && parseColor(resolve(css)); return x && back && (x[3] ?? 1) > 0 ? ratio(x, back) : null; };
  for (const [v, u] of uses) {
    if (!u.controls.size) continue;
    const controls = [...u.controls.values()].map((x) => ({ name: x.name, state: x.state, border: vs(`var(${v})`), fill: x.fill ? vs(x.fill) : null }));
    const low = controls.filter((x) => x.border != null && x.border < 3 && !(x.fill != null && x.fill >= 3));
    rows.push({ var: v, controls, others: [...u.others].sort(), low });
  }
  return rows.sort((a, b) => b.low.length - a.low.length || a.var.localeCompare(b.var));
}

// The lines for the person: each token under 3:1 where a control uses it, then each doing two jobs.
export function tokenJobLines(rows = []) {
  const lines = [];
  const one = (x) => `${x.name}${x.state === 'at rest' ? '' : ` ${x.state}`} (border ${x.border}:1${x.fill != null ? `, fill ${x.fill}:1` : ', no fill'})`;
  for (const r of rows.filter((x) => x.low.length)) lines.push(`${r.var} is the edge by which ${r.low.slice(0, 4).map(one).join(', ')}${r.low.length > 4 ? ` and ${r.low.length - 4} more` : ''} show${r.low.length === 1 ? 's' : ''} it can be clicked, and neither it nor the fill reaches 3:1 against the page (WCAG 1.4.11). Give the control a border, or a fill, of 3:1 or more.`);
  for (const r of rows.filter((x) => x.others.length)) lines.push(`${r.var} does two jobs: the edge of controls (${r.controls.map((x) => x.name).slice(0, 4).join(', ')}${r.controls.length > 4 ? ` and ${r.controls.length - 4} more` : ''}) and a decorative border (${r.others.slice(0, 4).join(', ')}${r.others.length > 4 ? ` and ${r.others.length - 4} more` : ''}). A control border of its own (fed by the brand's colour, as this one is) lets each change without the other.`);
  return lines;
}
