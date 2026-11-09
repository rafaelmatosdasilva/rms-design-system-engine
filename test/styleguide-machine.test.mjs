// The style guide written for machines too (styleguide-machine.mjs): an index with a line per component and one file
// per component, from the page's own data, so an agent handed only the page's address gets the system's own answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { machineFiles, machineIndex, componentPage, componentSlug, isMachineFile, MACHINE_INDEX } from '../lib/styleguide-machine.mjs';
import { writeMachine, copyPage } from '../lib/styleguide-files.mjs';
import { readFileSync as read } from 'node:fs';
import { tempDir } from './helpers.mjs';

const DATA = {
  title: 'Acme',
  built: { code: 'abc1234567def', figma: '41', engine: '0123456789ab', at: '2026-01-02' },
  tokens: { colors: {}, spacing: {}, $description: 'ignored' },
  allVars: [1, 2, 3, 4],
  usedTokens: [1, 2, 3],
  icons: [1, 2],
  wcag21: { criteria: { '1.4.3': {}, '4.1.2': {} } },
  decisions: [
    { component: null, kind: 'gap', what: 'nothing fitted "a split button"', ruledOut: ['a menu button'], why: 'It hides the main action.' },
    { component: 'cardTile', kind: 'answered', what: 'No: add a second action', ruledOut: ['a second action'], why: 'One tile, one action.' },
    { component: null, kind: 'kept', what: 'the corner radius', ruledOut: [], why: 'Both are right.' },
  ],
  components: [
    {
      name: 'cardTile',
      description: 'One thing in a list.',
      api: { tag: 'acme-card-tile', file: 'src/CardTile.vue', syntax: '<acme-card-tile size="m" />', props: [{ name: 'size', type: 'string' }, { name: 'flat', type: 'boolean' }, { name: 'rows', type: 'array' }], events: ['select'], slots: [] },
      import: { line: "import { CardTile } from '@acme/ui';", from: '@acme/ui' },
      controls: [{ label: 'Size', prop: 'size', type: 'VARIANT', default: 'm', options: [{ label: 's' }, { label: 'm' }, { label: 'l' }] },
        { label: 'Flat', prop: 'flat', type: 'BOOLEAN', default: 'false', options: ['no', 'yes'] },
        { label: 'Rows', prop: 'rows', type: 'TEXT', default: [{ label: 'one' }] }],
      intentLayer: { purpose: 'Show one thing in a list.', whenToUse: ['In a list of things.'], whenNotToUse: ['For one thing on its own.'], rules: ['Keep its title to one line.'], mistakes: ['Used as a button.'], limitations: ['It holds one action.'] },
      tokens: [{ prop: 'padding', var: '--acme-space-m', selector: '.cardTile' }],
      a11y: { role: 'group', roleFrom: 'the code', expects: ['a name'], notes: [{ text: 'Its title names it.', sc: '1.3.1', kind: 'name' }, 'A note an older page kept as words alone.'] },
      a11yFindings: [{ check: 'name', plain: 'It has no accessible name.', wcag: '4.1.2', todo: 'Give it an aria-label.' }],
      parity: { counts: { agree: 4, differ: 1, notBuilt: 0, notCompared: 2 } },
      differences: [{ check: 'padding', plain: 'Figma pads it 16px, the code 12px.', todo: 'Set its padding to 16px.' }],
      uses: ['cardTileLabel'],
      links: [{ label: 'Figma', url: 'https://example.com/figma' }],
      changelog: [{ sha: 'a1', date: '2026-01-01', subject: 'Built it', by: 'QA' }],
    },
    { name: 'cardTileLabel', description: 'The tile\'s title.', partOf: { root: 'cardTile' } },
    { name: 'bareThing' },   // a component the system holds and nothing else is known about
  ],
};

const page = (data = DATA) => `<!doctype html><html><head></head><body>
<script type="application/json" id="sg-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</body></html>`;

test('the index lists every component whole, each pointing at its own file, and says what the system holds', () => {
  const text = machineIndex(DATA);
  assert.match(text, /^# Acme - machine-readable index$/m);
  // Where it came from, so a twin built from older inputs can be told from a current one.
  assert.match(text, /From code abc1234567, Figma 41, engine 0123456789, built 2026-01-02\./);
  assert.match(text, /2 components, 4 variables\./);   // the part is not a component to choose
  // One line a component, its file beside it, its props as the code takes them.
  assert.match(text, /- \[cardTile\]\(\.\/c\/cardTile\.md\) - One thing in a list\. · props: size, flat, rows/);
  assert.match(text, /- \[bareThing\]\(\.\/c\/bareThing\.md\)$/m);
  assert.match(text, /    - avoid: For one thing on its own\./);
  assert.match(text, /    - parts \(placed only inside it, never on their own\): cardTileLabel/);
  assert.match(text, /    - the design and the code differ in 1 place: see its file/);
  // A part is listed under its root, never as a component of its own.
  assert.doesNotMatch(text, /^- \[cardTileLabel\]/m);
  // The mandate: an index that only lists what exists leaves an agent building its own.
  assert.match(text, /\*\*Use these components\.\*\*/);
  assert.match(text, /- families: colors, spacing$/m);   // $-keys are not a family
  assert.match(text, /3 of 4 variables are used in the code\./);
  assert.match(text, /2 WCAG 2\.1 criteria are checked on every build\./);
  // What the team turned down, so an agent does not propose it again; a decision that ruled nothing out is history.
  assert.match(text, /## Decided against\n\n- a menu button - turned down, nothing fitted "a split button": It hides the main action\./);
  assert.doesNotMatch(text, /the corner radius/);
  // A decision about one component belongs on that component's file, not in the index.
  assert.doesNotMatch(text, /a second action/);
});

test('a component\'s file holds what its page holds: how to write it, what it takes, its tokens, its accessibility and where it differs', () => {
  const text = componentPage(DATA.components[0], DATA);
  assert.match(text, /^# cardTile$/m);
  assert.match(text, /^One thing in a list\.$/m);
  // It says it is generated and where the page for people is, so nobody edits it and a reader can go there.
  assert.match(text, /Never edit this file/);
  assert.match(text, /\.\.\/index\.html#c-cardTile/);
  assert.match(text, /## Write it like this[\s\S]*import \{ CardTile \} from '@acme\/ui';[\s\S]*<acme-card-tile size="m" \/>/);
  assert.match(text, /Its code is `src\/CardTile\.vue`\./);
  // Its props as a table, each with the default and the values the page offers.
  assert.match(text, /\| size \| string \| m \| s, m, l \|/);
  // An option the page keeps as records, and an older page's plain words: both read as the values to write.
  assert.match(text, /\| flat \| boolean \| false \| no, yes \|/);
  // A default the page holds as a list is left out rather than written as an object.
  assert.match(text, /\| rows \| array \|  \|  \|/);
  assert.doesNotMatch(text, /\[object Object\]/);
  assert.match(text, /## Events\n\n- select/);
  assert.match(text, /## What it is for\n\nShow one thing in a list\./);
  assert.match(text, /## When not to use it\n\n- For one thing on its own\./);
  assert.match(text, /## Rules\n\n- Keep its title to one line\./);
  assert.match(text, /## Mistakes made with it\n\n- Used as a button\./);
  assert.match(text, /## What it cannot do\n\n- It holds one action\./);
  assert.match(text, /## Its parts\n\nPlaced only inside it, never on their own: cardTileLabel\./);
  assert.match(text, /## The tokens it uses\n\n- padding: --acme-space-m/);
  assert.match(text, /Its role is `group` \(the code\)\./);
  // A note the page keeps as a record, and one an older page kept as words alone: both read as words, never as an object.
  assert.match(text, /- Its title names it\. \(WCAG 1\.3\.1\)/);
  assert.match(text, /- A note an older page kept as words alone\./);
  assert.doesNotMatch(text, /\[object Object\]/);
  assert.match(text, /- It has no accessible name\. \(WCAG 4\.1\.2\) To fix: Give it an aria-label\./);
  assert.match(text, /4 agree, 1 differ, 0 not built, 2 not compared\./);
  assert.match(text, /- Figma pads it 16px, the code 12px\. To fix: Set its padding to 16px\./);
  assert.match(text, /\[Figma\]\(https:\/\/example\.com\/figma\)/);
  assert.match(text, /## Decided against\n\n- a second action - turned down, No: add a second action: One tile, one action\./);
  assert.match(text, /- 2026-01-01 Built it \(QA\)/);
  // Nothing is invented: no slots, so no heading for them, and never a blank table row.
  assert.doesNotMatch(text, /## Slots/);
  assert.doesNotMatch(text, /\n\n\n/);
});

test('a component nothing is known about gets a file with its name and nothing made up', () => {
  const text = componentPage(DATA.components[2], DATA);
  assert.match(text, /^# bareThing$/m);
  for (const heading of ['What it takes', 'Write it like this', 'Accessibility', 'Where the design and the code differ', 'The tokens it uses']) {
    assert.doesNotMatch(text, new RegExp(`## ${heading}`), heading);
  }
});

test('a component with nothing compared carries no heading about a comparison', () => {
  const nothing = { name: 'cardTile', parity: { counts: { agree: 0, differ: 0, notBuilt: 0, notCompared: 0 } } };
  assert.doesNotMatch(componentPage(nothing, { components: [nothing] }), /## Where the design and the code differ/);
});

test('a file is named as the page names its section, and the twin is the index and one file a component', () => {
  assert.equal(componentSlug('card/tile 2'), 'card-tile-2');
  const files = machineFiles(DATA);
  assert.deepEqual([...files.keys()], [MACHINE_INDEX, 'c/cardTile.md', 'c/cardTileLabel.md', 'c/bareThing.md']);
  assert.ok([...files.keys()].every(isMachineFile));
  assert.ok(!isMachineFile('assets/index.data.0123456789.js'));
  assert.ok(!isMachineFile('c/cardTile.html'));
  // No components, nothing to say: a project's own template builds no twin.
  assert.equal(machineFiles({ title: 'Acme' }).size, 0);
  assert.equal(machineFiles({}).size, 0);
});

test('the twin is written beside the page, and a component the system no longer holds leaves with its file', () => {
  const d = tempDir('sg-machine');
  const out = join(d, 'index.html');
  writeFileSync(out, page());
  const first = writeMachine(out, page());
  assert.equal(first.files.length, 4);
  assert.ok(existsSync(join(d, MACHINE_INDEX)));
  assert.match(readFileSync(join(d, 'c/cardTile.md'), 'utf8'), /^# cardTile$/m);
  // The next build holds one component fewer: its file goes, the rest stay.
  const fewer = { ...DATA, components: [DATA.components[0]] };
  const second = writeMachine(out, page(fewer));
  assert.deepEqual(second.files, [MACHINE_INDEX, 'c/cardTile.md']);
  assert.deepEqual(readdirSync(join(d, 'c')), ['cardTile.md']);
  assert.ok(existsSync(join(d, MACHINE_INDEX)));
  // A page with no data writes nothing, and leaves what is there as it is.
  assert.deepEqual(writeMachine(out, '<!doctype html><html></html>').files, []);
  assert.ok(existsSync(join(d, 'c/cardTile.md')));
});

test('the job that publishes the page publishes the twin with it', () => {
  const d = tempDir('sg-machine-copy');
  const out = join(d, 'index.html');
  writeFileSync(out, page());
  writeMachine(out, page());
  const to = join(d, 'public');
  const copied = copyPage(out, to);
  assert.ok(copied.includes(MACHINE_INDEX), 'the index is published');
  assert.ok(copied.includes('c/cardTile.md'), 'each component is published');
  assert.match(readFileSync(join(to, 'c/cardTile.md'), 'utf8'), /^# cardTile$/m);
});

test('the build writes the twin for the page it built, and never for the code capture\'s own copy', () => {
  // As the other pages of the guide are tested (construction-page.test.mjs): the generator needs a whole project, so
  // what is checked here is that it calls this, and where.
  const gen = read(new URL('../lib/styleguide-gen.mjs', import.meta.url), 'utf8');
  assert.match(gen, /import \{ writeStyleguide, writeMachine \} from '\.\/styleguide-files\.mjs';/);
  assert.match(gen, /const machine = opts\.out \? \{ files: \[\] \} : writeMachine\(outPath, html\);/);
  // It is written after the page, from the same text the page was written from.
  assert.ok(gen.indexOf('writeStyleguide(outPath, html') < gen.indexOf('writeMachine(outPath, html)'));
  // And the run says how many files it wrote.
  assert.match(gen, /machine: machine\.files\.length/);
});
