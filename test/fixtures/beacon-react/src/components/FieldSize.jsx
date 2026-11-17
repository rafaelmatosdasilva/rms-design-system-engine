import { createContext, useContext } from 'react';
import './field.css';

// A form says how big its fields are, and each field reads it. The stand-in runs no context, so a field drawn by it
// is always the default size however the form is set.
export const FormSize = createContext('medium');

export function FieldSize({ label = 'Name', value = '' }) {
  const size = useContext(FormSize);
  return (
    <label className={`bc-field bc-field--${size}`}>
      <span className="bc-field__label">{label}</span>
      <input className="bc-field__input" defaultValue={value} />
    </label>
  );
}
