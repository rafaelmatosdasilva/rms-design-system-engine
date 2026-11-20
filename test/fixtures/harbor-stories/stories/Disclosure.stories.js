import HbDisclosure from '../components/HbDisclosure.vue';
export default { title: 'Components/Disclosure', component: HbDisclosure };
export const Closed = { args: { label: 'Details' } };
const after = () => new Promise((ok) => setTimeout(ok, 50));
// The team's own script of a person using it: a click opens it.
export const Opens = {
  args: { label: 'Details' },
  play: async ({ canvasElement }) => {
    const summary = canvasElement.querySelector('button');
    summary.click(); await after();
    if (summary.getAttribute('aria-expanded') !== 'true') throw new Error('A click did not open the disclosure.');
  },
};
// And Escape closes it again, which the component does not do: this one fails.
export const ClosesOnEscape = {
  args: { label: 'Details' },
  play: async ({ canvasElement }) => {
    const summary = canvasElement.querySelector('button');
    summary.click(); await after();
    summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await after();
    if (summary.getAttribute('aria-expanded') !== 'false') throw new Error('Escape did not close the disclosure.');
  },
};
