import { Button } from '../components/Button.jsx';
import { Chip } from '../components/Chip.jsx';
import { Field } from '../components/Field.jsx';
import { Tag } from '../components/Tag.jsx';
import './settings.css';

export function Settings() {
  return (
    <main className="settings">
      <h1 className="settings__title">Settings</h1>
      <Field value="Ada" label="Name" />
      <div className="settings__filters">
        <Chip Label="Filter" />
        <Chip Label="Filter" Size="L" Icon />
        <Tag Label="New" Tone="Positive" />
      </div>
      <Button Label="Save" />
    </main>
  );
}
