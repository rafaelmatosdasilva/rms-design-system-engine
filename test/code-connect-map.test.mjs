// The project's own Code Connect files, read for which Figma property each code prop is: the template form
// (figma.selectedInstance.get…, an attribute of figma.html) and the classic one (figma.connect with props).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectFile, codeConnectFor } from '../code-connect-map.mjs';

test('the template form: each variable by the attribute it fills, a switch by the part it gives, a key of an object prop by its list', () => {
  const text = `// url=https://www.figma.com/file/AbC/buttonPrimary?node-id=3621-53438
// component=button-primary
import figma from 'figma'
const buttonSize = figma.selectedInstance.getEnum('size', { s: 's', m: 'm', l: 'l' })
const disabled = figma.selectedInstance.getBoolean('disabled')
const showLabel = figma.selectedInstance.getBoolean('showLabel')
const label = figma.selectedInstance.getString('labelContent')
const filled = figma.selectedInstance.getEnum('filled', { true: true, false: false })
const params = [filled ? 'x: 1' : ''].join(',')
export default {
  example: figma.html\`
<button-primary
  \${showLabel && label ? \`label="\${label}"\` : ''}
  \${buttonSize !== 'm' ? \`buttonSize="\${buttonSize}"\` : ''}
  \${disabled ? 'disabled' : ''}
  :params="{ \${params} }"
/>\`,
  imports: ["import ButtonPrimary from '@/components/library/buttons/Primary'"],
}`;
  const [m] = parseConnectFile(text, 'Primary.figma.js');
  assert.equal(m.nodeId, '3621:53438'); assert.equal(m.slug, 'buttonPrimary'); assert.equal(m.tag, 'button-primary');
  assert.deepEqual(m.props.map((p) => `${p.figma}→${p.code}`), ['size→buttonSize', 'disabled→disabled', 'showLabel→label', 'labelContent→label', 'filled→params.x']);
  assert.equal(m.props[4].role, 'condition', 'a key a list joined into :params writes only when filled is on');
  assert.deepEqual(m.props[0].values, { s: 's', m: 'm', l: 'l' });
  assert.equal(codeConnectFor([m], 'other', '3621-53438'), m, 'joined by node id');
  assert.equal(codeConnectFor([m], 'buttonPrimary', null), m, 'else by the name its link carries');
});

test('the classic form: each code prop beside the Figma property it reads', () => {
  const [m] = parseConnectFile(`figma.connect(Button, 'https://www.figma.com/design/AbC/Kit?node-id=1-2', { props: { label: figma.string('Label'), size: figma.enum('Size', { Small: 'sm', Large: 'lg' }), disabled: figma.boolean('Disabled') }, example: (p) => <Button {...p} /> })`, 'Button.figma.tsx');
  assert.equal(m.nodeId, '1:2');
  assert.deepEqual(m.props.map((p) => `${p.figma}→${p.code}`), ['Label→label', 'Size→size', 'Disabled→disabled']);
  assert.deepEqual(m.props[1].values, { Small: 'sm', Large: 'lg' });
});

test('the template form read as code: a value, a condition (negated, or a comparison), an event, a fixed value, a nested tag', () => {
  const text = `// url=https://www.figma.com/design/AbC/tileOne?node-id=10-20
// component=tile-one
import figma from 'figma'
import { iconOf } from './helpers'
const revealCaption = figma.selectedInstance.getBoolean('revealCaption')
const label = figma.selectedInstance.getString('captionWords')
const tone = figma.selectedInstance.getEnum('tone', { Calm: 'calm', Loud: 'loud' })
const outlined = figma.selectedInstance.getBoolean('outlined')
const showLink = figma.selectedInstance.getBoolean('showLink')
const icon = iconOf(figma.selectedInstance, 'iconContent')
const width = figma.selectedInstance.getEnum('width', { Wide: 'wide' })
const parts = [outlined ? 'a' : ''].join(',')
export default {
  example: figma.html\`
<tile-one
  \${revealCaption && label ? \`label="\${label}"\` : ''}
  \${!revealCaption ? \`icon="\${icon}"\` : ''}
  \${tone !== 'calm' ? \`tone="\${tone}"\` : ''}
  \${tone === 'loud' ? 'shout' : ''}
  \${outlined ? 'outlined' : ''}
  \${showLink ? 'href="#"' : ''}
  \${showLink ? '@opened="go"' : ''}
  :options="{ width: '\${width}', parts: '\${parts}' }"
>
  <tile-badge \${outlined ? 'framed' : ''} />
</tile-one>\`,
}`;
  const [m] = parseConnectFile(text, 'One.figma.js');
  const say = (p) => `${p.figma}→${p.code ?? '∅'}${p.role === 'condition' ? ` if${p.negated ? ' not' : ''}${p.equals != null ? ` =${p.equals}` : ''}` : ''}${p.event ? ' event' : ''}`;
  assert.equal(m.tag, 'tile-one');
  assert.deepEqual(m.props.map(say), [
    'revealCaption→label if', 'revealCaption→icon if not',
    'captionWords→label',
    'tone→tone', 'tone→shout if =loud',
    'outlined→outlined',
    'showLink→href if', 'showLink→opened if event',
    'iconContent→icon',
    'width→options.width',
  ], 'its own attributes only: the badge\'s framed belongs to the badge');
  assert.deepEqual(m.props.find((p) => p.figma === 'tone').values, { Calm: 'calm', Loud: 'loud' });
  assert.ok(!m.props.some((p) => p.code === 'framed'), 'an attribute of another component inside the example is not this one\'s');
});

test('a template file that reads no property still connects its component', () => {
  const [m] = parseConnectFile(`// url=https://www.figma.com/design/AbC/tileTwo?node-id=3-4
import figma from 'figma'
export default { example: figma.html\`<tile-two :rows="rows" @clicked="go" />\` }`, 'Two.figma.js');
  assert.equal(m.nodeId, '3:4'); assert.equal(m.tag, 'tile-two'); assert.deepEqual(m.props, []);
});

test('a list joined into an object prop: each key by its own conditions; a fixed true or false is the property\'s own value', () => {
  const text = `// url=https://www.figma.com/design/AbC/tileOne?node-id=1204-30551
import figma from 'figma'
const showCaption = figma.selectedInstance.getBoolean('showCaption')
const caption = figma.selectedInstance.getString('captionWords')
const pinned = figma.selectedInstance.getBoolean('pinned')
const framed = figma.selectedInstance.getBoolean('framed')
const helper = figma.selectedInstance.getString('helperWords')
const tone = figma.selectedInstance.getEnum('tone', { calm: 'calm', loud: 'loud' })
const opts = [
  showCaption && caption ? \`caption: '\${caption}'\` : '',
  pinned ? 'pinned: true' : '',
].filter(Boolean).join(', ')
export default {
  example: figma.html\`
<tile-one
  :opts="{ \${opts} }"
  \${!framed ? ':framed="false"' : ''}
  \${tone === 'loud' && helper ? \`warning="\${helper}"\` : ''}
  \${tone === 'calm' && helper ? \`note="\${helper}"\` : ''}
/>\`,
}`;
  const [m] = parseConnectFile(text, 'Tile.figma.js');
  assert.equal(m.nodeId, '1204:30551', 'a node id whose second part starts with 3 is read whole');
  const say = (p) => `${p.figma}→${p.code}:${p.role}${p.negated ? '!' : ''}`;
  const read = m.props.map(say);
  for (const x of ['captionWords→opts.caption:value', 'showCaption→opts.caption:condition', 'pinned→opts.pinned:value', 'framed→framed:value', 'helperWords→warning:value', 'helperWords→note:value'])
    assert.ok(read.includes(x), `${x} in ${read.join(', ')}`);
  assert.ok(!read.includes('pinned→opts.caption:condition'), 'one item\'s condition never reaches another item');
});
