import HbButton from '../components/HbButton.vue';
export default {
  title: 'Components/Button', component: HbButton,
  // What the team wrote by hand, read into the spec. Two lines disagree with the code on purpose: tone, a prop the code
  // no longer has, and label's default. size lists Huge, an option neither the code nor Figma has.
  parameters: { docs: { description: { component: 'The one action a person takes next on a page.' } } },
  argTypes: {
    variant: { description: 'How much the action stands out: Primary for the main one, Secondary beside it.', options: ['Primary', 'Secondary'] },
    size: { description: 'Small in dense layouts, Large where the action leads the page.', options: ['Small', 'Large', 'Huge'], table: { defaultValue: { summary: 'Small' } } },
    label: { description: 'The words on the button, a verb first.', table: { defaultValue: { summary: 'Go' } } },
    tone: { description: 'Replaced by variant.' },
  },
};
export const Primary = { args: { variant: 'Primary', label: 'Continue' } };
export const Secondary = { args: { variant: 'Secondary', label: 'Back' } };
export const Large = { args: { size: 'Large', label: 'Continue' } };
export const Loading = { args: { label: 'Saving', loading: true } };
export const Huge = { args: { size: 'Huge', label: 'Continue' } };
