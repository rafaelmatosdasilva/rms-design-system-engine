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
