import './field.css';
export function Field({ State = 'Default', value = '', label = 'Name', ...rest }) {
  return (
    <label className={`field${State === 'Error' ? ' field--error' : ''}`}>
      <input className="field__input" aria-label={label} defaultValue={value} aria-invalid={State === 'Error' ? 'true' : undefined} {...rest} />
    </label>
  );
}
