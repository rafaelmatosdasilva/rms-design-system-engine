// The project's own Code Connect files, read for which Figma property each code prop is: the template form
// (figma.selectedInstance.get…, an attribute of figma.html) and the classic one (figma.connect with props).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectFile, codeConnectFor } from '../code-connect-map.mjs';

test('the template form: each variable by the attribute it fills, a switch by the part it gives, a prop built from several by none', () => {
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
  assert.deepEqual(m.props.map((p) => `${p.figma}→${p.code}`), ['size→buttonSize', 'disabled→disabled', 'showLabel→label', 'labelContent→label', 'filled→null']);
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
