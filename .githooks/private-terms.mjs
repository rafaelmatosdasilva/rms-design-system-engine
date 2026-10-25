#!/usr/bin/env node
// private-terms.mjs - the names of every project the engine has worked on, kept on this computer only, never in the
// repository: what the private check refuses besides its hashed list, so a new client is covered from its first run
// without anyone remembering to add its names.
//
// Each project the engine runs on is remembered (rememberProject, called when the engine resolves its project). From
// each one the distinctive names are read: its own and its package's name, its repository and hosts, its Figma file
// keys, its components, its tokens (the whole path and each part), its brands and its font families. A plain English
// word, a CSS or HTML word, or a part shorter than 4 letters is never a term: "button" and "primary" are everyone's.
// The list is built again whenever a project's setup or Figma data is newer than it.
//
//   node .githooks/private-terms.mjs --add <folder>    remember a project (its folder holds ds-config.json)
//   node .githooks/private-terms.mjs --scan <folder>   remember every project found under a folder
//   node .githooks/private-terms.mjs --allow <word>    a term that is the engine's own, never refused again
//   node .githooks/private-terms.mjs --name <word>     a project's name that is a plain word (a theme, a brand): refused
//                                                      where the text uses it as a name, kept on this computer only
//   node .githooks/private-terms.mjs --list            the projects and how many terms each gives
//   node .githooks/private-terms.mjs --review          the terms the engine's files already carry, to fix or allow
//
// Where it is kept: RMS_PRIVATE_TERMS_DIR, else ~/.config/rms-engine (private-projects.json, private-terms.json).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const DIR = () => process.env.RMS_PRIVATE_TERMS_DIR || join(homedir(), '.config', 'rms-engine');
const PROJECTS = () => join(DIR(), 'private-projects.json');
const TERMS = () => join(DIR(), 'private-terms.json');
const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true, mode: 0o700 }); writeFileSync(f, JSON.stringify(v, null, 2), { mode: 0o600 }); };
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Remembering projects ────────────────────────────────────────────────────────────────────────────────────────
// A folder the engine ran on. Not a temporary one (tests, CI), and nothing at all while tests or CI run.
export function rememberProject(dir) {
  try {
    if (process.env.CI || process.env.NODE_TEST_CONTEXT || process.env.RMS_NO_REMEMBER) return false;
    const at = realpathSync(resolve(dir));
    if (at.startsWith(realpathSync(tmpdir())) || at.startsWith('/tmp/') || at.startsWith('/private/tmp/')) return false;
    if (!existsSync(join(at, 'ds-config.json'))) return false;
    const p = readJson(PROJECTS(), { projects: [] });
    if (p.projects.includes(at)) return false;
    p.projects.push(at); writeJson(PROJECTS(), p);
    return true;
  } catch { return false; }
}

// ── Reading a project's names ───────────────────────────────────────────────────────────────────────────────────
// Only the names a project's people chose are read: its components and their properties and options, its tokens'
// paths, its collections and modes, its brands, its fonts, its pages and screens, its icons. The keys the engine's own
// captures write (paddingVar, radiusPx, variantOptions) are never a project's, so they are never read.
let COMMON = null, HAS_DICT = false;
// The words everyone uses: the system's dictionary (a plural read as its singular), and CSS's and design systems'.
function common() {
  if (COMMON) return COMMON;
  COMMON = new Set();
  for (const f of ['/usr/share/dict/words', '/usr/share/dict/web2', '/usr/dict/words', '/usr/share/dict/american-english']) {
    try { for (const w of readFileSync(f, 'utf8').split('\n')) if (w) COMMON.add(w.toLowerCase()); HAS_DICT = true; break; } catch { /* the next */ }
  }
  for (const w of GENERIC_WORDS.split(/\s+/)) COMMON.add(w);
  return COMMON;
}
// A dictionary lists "require", not "required", so an inflection of a common word is common too. Without this, a
// project that happens to name a property "required" makes an everyday English word private, and every honest commit
// that writes "is required" is refused.
const isCommon = (w) => {
  const c = common();
  return c.has(w)
    || (w.endsWith('ies') && c.has(w.slice(0, -3) + 'y'))
    || (w.endsWith('es') && c.has(w.slice(0, -2)))
    || (w.endsWith('s') && c.has(w.slice(0, -1)))
    || (w.endsWith('ed') && (c.has(w.slice(0, -1)) || c.has(w.slice(0, -2)) || c.has(w.slice(0, -3) + 'y')))
    || (w.endsWith('ing') && (c.has(w.slice(0, -3)) || c.has(w.slice(0, -3) + 'e')));
};
// The vocabulary of the web: the names the platform itself gives things. An engine that reads and writes pages
// cannot avoid writing them, and a dictionary holds almost none, so without this list each one a project happens to
// use for a property or a token turns an engine file that uses it in its ordinary sense into a refused commit. These
// are nobody's secret: nothing here is learned from a project, and a name a project really chose is still refused.
const WEB_WORDS = 'textcontent innerhtml outerhtml innertext classlist dataset nodename nodetype nodevalue parentnode childnodes firstchild lastchild nextsibling previoussibling queryselector queryselectorall getelementbyid createelement appendchild removechild insertbefore setattribute getattribute removeattribute hasattribute addeventlistener removeeventlistener dispatchevent preventdefault stoppropagation currenttarget clientwidth clientheight offsetwidth offsetheight scrollwidth scrollheight scrolltop scrollleft getboundingclientrect getcomputedstyle matchmedia requestanimationframe required download upload readonly novalidate maxlength minlength autocomplete formaction contenteditable draggable spellcheck var vars currentcolor inherit initial unset revert';
// Words of CSS, HTML and design systems a dictionary may lack.
const GENERIC_WORDS = WEB_WORDS + ' small medium large xs sm md lg xl xxl xxs xxxs xxxl px rem em ms vh vw dp pt deg rgb rgba hsl hex svg png css html js ui ux api url id ids nav btn img src alt aria rtl ltr min max auto inline flex grid hug fill fixed rgb srgb dropdown tooltip popover checkbox textarea navbar sidebar topbar toolbar statusbar breadcrumb breadcrumbs stepper spinner skeleton snackbar toast toasts accordion carousel pagination paginator datepicker timepicker colorpicker combobox listbox menubar tablist tabpanel treeview tree avatar badge chip chips tag tags pill slider switch toggle radio dialog modal sheet drawer popup lightbox banner callout alert alerts hero footer header heading subheading caption overline eyebrow placeholder hover focus focused pressed disabled readonly selected unselected checked unchecked indeterminate expanded collapsed active inactive visited loading empty error success warning info positive negative neutral pending critical primary secondary tertiary quaternary accent brand inverse inverted muted subtle strong emphasis elevated elevation surface surfaces background foreground outline outlined filled ghost link plain solid dashed dotted rounded pill radius radii stroke strokes shadow shadows blur opacity gradient overlay scrim backdrop divider dividers separator spacing spacer gap gaps padding margin inset offset width height size sizes sizing typography typeface font fonts weight weights lineheight letterspacing paragraph body label labels title titles subtitle display headline icon icons iconography illustration logo logos token tokens semantic primitive primitives alias aliases mode modes theme themes light dark density compact comfortable spacious breakpoint breakpoints viewport desktop laptop tablet mobile phone motion duration durations easing easings transition transitions animation keyframe delay variant variants variable variables property properties component components instance instances slot slots state states boolean booleans string strings number numbers collection collections layer layers frame frames page pages screen screens section sections figma';
// What a label in a self-hosted address names when it is the service, not the company that runs it.
const SERVICE_LABELS = new Set('git gitlab github bitbucket gitea gogs svn scm vcs repo repos code www web mail smtp imap jira confluence artifactory nexus npm registry docker harbor ci cd runner pages wiki intranet portal dev devel staging stage test qa uat prod production'.split(' '));
// Names made of common words that every design system writes the same way: never a project's own.
const GENERIC_NAMES = new Set(('buttonprimary buttonsecondary buttontertiary buttonlink buttonicon iconbutton buttongroup ' +
  'textbutton linkbutton radiobutton radiogroup checkboxgroup togglebutton switchbutton segmentedcontrol listitem listgroup ' +
  'menuitem menulist dropdownmenu selectmenu searchbar searchfield searchinput textfield textinput inputfield inputtext ' +
  'inputsearch inputtextarea inputgroup formfield formgroup formlabel helpertext errortext errorstate emptystate loadingstate ' +
  'successstate statusbar actionbar appbar tabbar navbar sidebar topbar bottombar toolbar progressbar scrollbar tabgroup ' +
  'chipgroup taggroup cardheader cardbody cardfooter cardtitle cardimage modalheader modalbody modalfooter dialogtitle ' +
  'tablerow tablecell tableheader tablehead tablebody tablefooter datatable listview gridview treeview tooltippopover ' +
  'dividerline dividersection sectionheader sectiontitle pageheader pagetitle mainmenu sidemenu contextmenu navitem navlink ' +
  'breadcrumbitem stepperitem paginationitem avatargroup badgegroup timeline timelineitem statusbadge statuspill ' +
  'linethrough lineheight letterspacing fontsize fontweight fontfamily minwidth maxwidth minheight maxheight fullwidth ' +
  'fullheight borderradius borderwidth bordercolor backgroundcolor textcolor iconcolor iconsize focusring focusvisible ' +
  'showlabel showicon showdivider showdividerline showactions showheader showfooter hasicon haschild haslabel ' +
  'appbackground pagebackground surfacecolor elevationhigh elevationmedium elevationlow statelayer xsmall xlarge xxlarge').split(/\s+/));
const camelParts = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((x) => x.toLowerCase());
const SIZE_STEP = /^(x*[sml]|\d*x[sl]|xxxs|xxxl|[sml]\d?|\d+x)$/;
// A name a project chose, as a term to refuse, or null: a number, a colour, a size step, a common word or a name
// every system writes (buttonPrimary) is no project's. A name of the project itself, a brand's or a font's counts
// from 3 letters (own); any other from 4.
function distinctive(raw, { own = false } = {}) {
  const t = norm(raw);
  if (t.length < (own ? 3 : 4) || /^\d+$/.test(t) || /^[0-9a-f]{6,8}$/.test(t) || /^\d+(px|rem|em|ms|s|pt|vh|vw|deg|x)?$/.test(t) || SIZE_STEP.test(t)) return null;
  const bare = t.replace(/\d+$/, '');
  if (isCommon(t) || (bare !== t && (isCommon(bare) || GENERIC_NAMES.has(bare))) || GENERIC_NAMES.has(t)) return null;
  const parts = camelParts(raw).filter((x) => !/^\d+$/.test(x));
  // One plain word is a project's only when a dictionary says it is no word: with none on this computer, never.
  if (parts.length <= 1 && !own) return HAS_DICT && parts.length && !isCommon(parts[0]) && !SIZE_STEP.test(parts[0]) ? t : null;
  return t;
}

const FIGMA_KEY = /figma\.com\/(?:design|file|board|proto|make|slides)\/([A-Za-z0-9]{15,})/g;
export function projectTerms(root) {
  const out = new Map();   // term → where it came from
  const phrases = new Set();   // the terms written as words apart (Acme Grotesk), matched in prose too
  // A theme's, a brand's, a mode's or a collection's name that is a plain word (Acme Standard, Northwind): never refused as a
  // word, only where the text uses it as a name (localTerms → find). Design systems' own words are left out.
  const named = new Map();
  const add = (raw, from, o) => {
    const t = distinctive(raw, o);
    if (t && !out.has(t)) out.set(t, from);
    if (t && o?.own && /\s/.test(String(raw).trim())) phrases.add(t);
    const w = norm(raw);
    if (!t && o?.named && w.length >= 3 && /^[a-z]+$/.test(w) && !GENERIC_WORDS.split(/\s+/).includes(w) && !named.has(w)) named.set(w, from);
  };
  const own = { own: true }, ownNamed = { own: true, named: true };
  // A name with a path (a token's, a/b/c), a variant's combination (State=Default, Size=M) or a property's id
  // (showFooter#33057:0): each part on its own, and the whole when it is one word.
  const name = (raw, from, o) => {
    const s = String(raw ?? '').replace(/#[\d:]+$/, '').trim();
    if (!s || s.length > 120) return;
    const parts = s.split(/\s*[/=,]\s*/).filter(Boolean);
    for (const p of parts) add(p, from, o);
    if (parts.length === 1 && /\s/.test(s)) for (const w of s.split(/\s+/)) add(w, from, o);
  };
  const keys = new Set(), hosts = new Set();
  const cfg = readJson(join(root, 'ds-config.json'), {});
  // Its custom themes, made with a module and kept apart from it (styleguide.modules: { path, data }): each one's name
  // and file are the project's as much as its brands are.
  for (const f of themeFiles(root, cfg)) { const t = readJson(f, {}); if (t.name) { add(t.name, 'custom theme', ownNamed); name(t.name, 'custom theme', ownNamed); } add(basename(f).replace(/\.theme\.json$|\.json$/i, ''), 'custom theme', own); }
  const near = (f) => { try { return readFileSync(join(root, f), 'utf8'); } catch { return ''; } };
  // The project's own names: its setup's name, its folder, its package, its repository and its hosts.
  if (cfg.name) { add(cfg.name, 'project name', own); for (const w of String(cfg.name).split(/\s+/)) add(w, 'project name', own); }
  for (const w of basename(root).split(/[^A-Za-z0-9]+/)) add(w, 'project folder', own);
  const pkg = readJson(join(root, 'package.json'), {});
  if (pkg.name) for (const w of String(pkg.name).split(/[@/]/)) add(w, 'package name', own);
  let remotes = '';
  try { remotes = execFileSync('git', ['-C', root, 'remote', '-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* no git */ }
  for (const text of [near('ds-config.json'), remotes, near('.design-system-engine-project'), near('.gitlab-source.json'), near('package.json')]) {
    for (const m of text.matchAll(FIGMA_KEY)) keys.add(m[1]);
    for (const m of text.matchAll(/"[\w]*[Ff]ile[Kk]ey"\s*:\s*"([A-Za-z0-9]{15,})"/g)) keys.add(m[1]);
    for (const m of text.matchAll(/(?:https?:\/\/|git@|ssh:\/\/(?:[\w.-]+@)?)([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?=[\s"'/)#?]|$)/gi)) {
      const [, host, owner, repo] = m;
      if (!PUBLIC_HOST.test(host)) hosts.add(host.toLowerCase());
      add(owner, 'repository owner', own); add(repo, 'repository name', own);
    }
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) if (!PUBLIC_HOST.test(m[1])) hosts.add(m[1].toLowerCase());
  }
  // Its Figma data, wherever its snapshots are.
  const snaps = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let ns = []; try { ns = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const n of ns) {
      if (n.name === 'node_modules' || n.name === '.git' || n.name.startsWith('.design-system-engine-out')) continue;
      const p = join(d, n.name);
      if (n.isDirectory()) walk(p, depth + 1);
      else if (/(^figma-.*\.snapshot\.json|^design\.json|^contract\.authored\.json|^tokens\.json)$/.test(n.name)) snaps.push(p);
    }
  };
  walk(root, 0);
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const own_ = (o) => Object.keys(o ?? {}).filter((k) => !k.startsWith('_'));
  for (const f of snaps) {
    const j = readJson(f, null); if (!j) continue;
    const from = basename(f).replace(/\.snapshot\.json$|\.json$/, '');
    const font = (k, v) => { if (typeof v === 'string' && /famil/i.test(k)) add(v.split(',')[0].replace(/["']/g, '').trim(), 'font family', own); };
    if (/^figma-vars$|^tokens$/.test(from)) {
      // Tokens: each group's modes, and each token's path (its value, when it is a family, is a font).
      for (const g of own_(j)) for (const [mode, map] of Object.entries(j[g] ?? {})) {
        if (!isObj(map)) continue;
        if (/[A-Za-z]/.test(mode) && !/\//.test(mode)) name(mode, `${from} mode`);
        for (const [path, v] of Object.entries(map)) { name(path, `${from} token`); font(path, typeof v === 'object' ? v?.value : v); if (typeof v === 'string' && v.includes('/')) name(v, `${from} token`); }
      }
    } else if (from === 'figma-brands') {
      for (const c of j.collections ?? []) {
        name(c.name, 'brand', ownNamed);
        for (const m of c.modes ?? []) name(typeof m === 'string' ? m : m?.name, 'brand mode', ownNamed);
        const ov = (o, d) => { if (!isObj(o) || d > 3) return; for (const [k, v] of Object.entries(o)) { if (k.includes('/')) { name(k, 'brand token'); if (isObj(v)) for (const x of Object.values(v)) font(k, typeof x === 'object' ? x?.value : x); } else ov(v, d + 1); } };
        ov(c.overrides, 0); ov(c.library, 0);
      }
    } else if (from === 'design') {
      for (const c of j.variables ?? []) {
        name(c.name, 'collection', { named: true }); for (const m of c.modes ?? []) name(m, 'mode', { named: true });
        for (const v of c.variables ?? []) { name(v.name, 'token'); for (const x of Object.values(v.values ?? {})) font(v.name, x); }
      }
      for (const p of j.pages ?? []) { name(p.name, 'page'); for (const fr of p.frames ?? []) name(fr?.name, 'frame'); for (const c of p.components ?? []) name(c?.name, 'component'); }
    } else {
      // Components (and a set's properties, options and parts), icons, screens: the names a file lists.
      const list = isObj(j.components) ? j.components : isObj(j.screens) ? j.screens : isObj(j.icons) ? j.icons : j;
      for (const [cn, c] of Object.entries(list ?? {})) {
        if (cn.startsWith('_')) continue;
        name(cn, `${from} name`);
        if (!isObj(c)) continue;
        if (typeof c.name === 'string') name(c.name, `${from} name`);
        for (const [pn, p] of Object.entries(isObj(c.properties) ? c.properties : {})) {
          name(pn, `${from} property`);
          for (const o of p?.variantOptions ?? p?.options ?? []) name(o, `${from} option`);
          if (typeof p?.defaultValue === 'string' && p.type === 'VARIANT') name(p.defaultValue, `${from} option`);
        }
        for (const s of c.parts ?? c.children ?? []) name(typeof s === 'string' ? s : s?.name, `${from} part`);
      }
    }
  }
  for (const k of keys) out.set(k.toLowerCase(), 'figma file key');
  // A self-hosted address keeps the whole host and the labels that name the company (gitlab.acme.com → acme), never
  // the label that names the service: "gitlab" in this engine's own pages is the service, not anyone's project, and
  // taking it as private would refuse every honest commit until someone bypassed the hook.
  for (const h of hosts) { out.set(norm(h), 'host'); for (const part of h.split('.').slice(0, -1)) if (!SERVICE_LABELS.has(part.toLowerCase())) add(part, 'host', own); }
  return { terms: out, phrases: [...phrases], named, keys: [...keys], hosts: [...hosts] };
}
// The theme files a project's modules keep for it: <data>/<system>/*.json (data: the entry's own folder, else the
// module's data/).
function themeFiles(root, cfg) {
  const sys = String(cfg.name || 'system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'system', out = [];
  const home = (p) => resolve(root, String(p).replace(/^~(?=$|\/)/, homedir()));
  for (const m of cfg.styleguide?.modules ?? []) {
    const dir = m && typeof m === 'object' ? (m.data ? home(m.data) : m.path ? join(home(m.path), 'data') : null) : typeof m === 'string' ? join(home(m), 'data') : null;
    if (!dir) continue;
    try { for (const f of readdirSync(join(dir, sys))) if (/\.json$/i.test(f)) out.push(join(dir, sys, f)); } catch { /* none for this system */ }
  }
  return out;
}
// Hosts everyone uses: never a project's own.
export const PUBLIC_HOST = /(^|\.)(figma\.com|github\.com|githubusercontent\.com|github\.io|gitlab\.com|bitbucket\.org|notion\.so|notion\.site|google\.com|googleapis\.com|gstatic\.com|npmjs\.(com|org)|jsdelivr\.net|unpkg\.com|w3\.org|mozilla\.org|example\.(com|org|net)|example|test|invalid|localhost|fontsource\.org|cloudflare\.com|claude\.(com|ai)|anthropic\.com|nodejs\.org|json-schema\.org|schema\.org|shields\.io|rsms\.me|git-scm\.com)$/i;

// ── The list ────────────────────────────────────────────────────────────────────────────────────────────────────
const newest = (root) => {
  let t = 0;
  const look = (f) => { try { t = Math.max(t, statSync(f).mtimeMs); } catch { /* none */ } };
  look(join(root, 'ds-config.json'));
  for (const f of themeFiles(root, readJson(join(root, 'ds-config.json'), {}))) look(f);   // a theme made since
  try { for (const n of readdirSync(root)) if (/\.json$/.test(n)) look(join(root, n)); } catch { /* none */ }
  return t;
};
export function buildTerms({ force = false } = {}) {
  const projects = readJson(PROJECTS(), { projects: [] }).projects.filter((p) => existsSync(p));
  const had = readJson(TERMS(), null);
  if (!force && had && projects.every((p) => newest(p) <= (had.built ?? 0)) && projects.length === (had.projects ?? []).length) return had;
  const terms = {}, keys = new Set(), hosts = new Set(), per = {}, phrases = new Set(), named = {};
  for (const p of projects) {
    const r = projectTerms(p);
    per[p] = r.terms.size;
    for (const [t, from] of r.terms) if (!terms[t]) terms[t] = `${from} (${basename(p)})`;
    r.keys.forEach((k) => keys.add(k)); r.hosts.forEach((h) => hosts.add(h)); r.phrases.forEach((x) => phrases.add(x));
    for (const [w, from] of r.named ?? []) if (!named[w]) named[w] = `${from} (${basename(p)})`;
  }
  const allow = had?.allow ?? [];
  // The plain-word names a person named by hand (--name), kept across rebuilds like what is allowed.
  for (const w of had?.namedByHand ?? []) if (!named[w]) named[w] = 'named by hand';
  for (const a of allow) { delete terms[norm(a)]; delete named[norm(a)]; }
  const out = { built: Date.now(), projects, per, allow, terms, phrases: [...phrases], named, namedByHand: had?.namedByHand ?? [], keys: [...keys], hosts: [...hosts] };
  writeJson(TERMS(), out);
  return out;
}

let LOADED;
// → { has(word), find(text) → [{ term, from }] } over the terms of this computer; empty where there are none (CI).
export function localTerms() {
  if (LOADED !== undefined) return LOADED;
  let t = null;
  try { t = existsSync(PROJECTS()) ? buildTerms() : readJson(TERMS(), null); } catch { t = null; }
  const map = new Map(Object.entries(t?.terms ?? {}));
  const allow = new Set((t?.allow ?? []).map(norm));
  const phrases = new Set(t?.phrases ?? []);
  const named = new Map(Object.entries(t?.named ?? {}).filter(([w]) => !allow.has(w)));
  LOADED = {
    size: map.size,
    find(text) {
      const hits = new Map();
      // A plain-word name used as a name: in quotes or backticks, as a key or a value (acme: , brand=acme),
      // capitalised in the middle of a sentence (each theme, Acme and…), or beside theme, brand or mode.
      for (const [w, from] of named) {
        const W = w[0].toUpperCase() + w.slice(1), s = String(text);
        // Capitalised after a lower-case word or an opening bracket (not in a title of capitalised words), or a label
        // between tags (<option>Acme</option>).
        const capitalised = new RegExp(`(?:\\b[a-z][a-z0-9]*[,;]?\\s+|\\(|>\\s*)${W}\\b`);
        // Quoted, as a key or as a value only with a theme, brand or mode beside it on the line (setQuery('brand',
        // 'acme')); a word next to one of those (the Acme theme) as it is.
        const near = (re) => s.split('\n').some((l) => re.test(l) && /\b(themes?|brands?|modes?)\b/i.test(l));
        const keyed = new RegExp(`["'\`]${w}["'\`]|\\b${w}\\s*[:=]|[=:]\\s*["']?${w}\\b`, 'i');
        const beside = new RegExp(`\\b(?:themes?|brands?|modes?)\\W+(?:\\w+\\W+){0,2}?${w}\\b|\\b${w}\\W+(?:\\w+\\W+){0,1}?(?:themes?|brands?|modes?)\\b`, 'i');
        if (capitalised.test(s) || beside.test(s) || near(keyed)) hits.set(w, `${from}, used as a name`);
      }
      if (!map.size) return [...hits].map(([term, from]) => ({ term, from }));
      // Words as an identifier writes them: camelCase is one word, and words joined by "-" or "_" are one name
      // (header-quokka, header_quokka); words apart in a sentence ("a header, quokka") never make a name.
      for (const chunk of String(text).split(/[^A-Za-z0-9_-]+/)) {
        const words = chunk.toLowerCase().split(/[-_]+/).filter(Boolean);
        for (let i = 0; i < words.length; i++) for (let n = 1; n <= 4 && i + n <= words.length; n++) {
          const run = words.slice(i, i + n).join('');
          if (map.has(run) && !allow.has(run)) hits.set(run, map.get(run));
        }
      }
      // A name written as words apart (a font, a brand: Acme Grotesk) in prose too.
      if (phrases.size) {
        const words = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        for (let i = 0; i < words.length; i++) for (let n = 2; n <= 4 && i + n <= words.length; n++) {
          const run = words.slice(i, i + n).join('');
          if (phrases.has(run) && map.has(run) && !allow.has(run)) hits.set(run, map.get(run));
        }
      }
      return [...hits].map(([term, from]) => ({ term, from }));
    },
  };
  return LOADED;
}

// ── Command line ────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const a = process.argv.slice(2), at = (f) => a[a.indexOf(f) + 1];
  if (a.includes('--add')) { const ok = rememberProject(at('--add')); console.log(ok ? 'remembered' : 'already remembered, or not a project (no ds-config.json)'); buildTerms({ force: true }); }
  else if (a.includes('--scan')) {
    const found = [];
    const walk = (d, depth) => { if (depth > 6) return; let ns = []; try { ns = readdirSync(d, { withFileTypes: true }); } catch { return; } if (ns.some((n) => n.name === 'ds-config.json')) found.push(d); for (const n of ns) if (n.isDirectory() && !/^(node_modules|\.git|\.Trash|Library)$/.test(n.name)) walk(join(d, n.name), depth + 1); };
    walk(resolve(at('--scan')), 0);
    for (const d of found) if (rememberProject(d)) console.log('remembered', d);
    buildTerms({ force: true });
  } else if (a.includes('--allow')) {
    const t = buildTerms(); t.allow = [...new Set([...(t.allow ?? []), at('--allow')])]; delete t.terms[norm(at('--allow'))]; writeJson(TERMS(), t); console.log('allowed', at('--allow'));
  } else if (a.includes('--name')) {
    const w = norm(at('--name') ?? '');
    if (!/^[a-z]{3,}$/.test(w)) { console.log('Give one word of 3 letters or more: --name <word>'); process.exit(2); }
    const t = buildTerms(); t.namedByHand = [...new Set([...(t.namedByHand ?? []), w])]; t.named = { ...(t.named ?? {}), [w]: 'named by hand' }; writeJson(TERMS(), t); console.log('named', w, '(refused where it is used as a name)');
  } else if (a.includes('--review')) {
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' }).split('\n').filter((f) => f && !/^test\/skill-evals\/records\//.test(f) && /\.(mjs|js|md|json|html|css|yml|sh)$/.test(f));
    const seen = new Map();
    for (const f of files) { let s; try { s = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; } for (const h of localTerms().find(s)) { const x = seen.get(h.term) ?? { from: h.from, files: new Set() }; x.files.add(f); seen.set(h.term, x); } }
    for (const [t, x] of [...seen].sort((p, q) => q[1].files.size - p[1].files.size)) console.log(`${t}  ←  ${x.from}  in ${x.files.size} file(s): ${[...x.files].slice(0, 3).join(', ')}`);
    console.log(`${seen.size} term(s) the engine's files carry. Fix the private ones; --allow the engine's own.`);
  } else {
    const t = buildTerms({ force: a.includes('--rebuild') });
    for (const p of t.projects) console.log(`${t.per[p] ?? 0} terms  ${p}`);
    console.log(`${Object.keys(t.terms).length} terms, ${t.keys.length} Figma keys, ${t.hosts.length} hosts, ${t.allow.length} allowed. Kept in ${DIR()}.`);
  }
}
