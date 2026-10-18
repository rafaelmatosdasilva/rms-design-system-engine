import { useState } from 'react';
import './stepper.css';
export function Stepper({ Value = '1', min = 0, max = 10, label = 'Quantity', 'aria-label': ariaLabel, ...rest }) {
  const [value, setValue] = useState(Number(Value) || 0);
  const set = (v) => setValue(Math.min(max, Math.max(min, v)));
  const keys = (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); set(value + 1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); set(value - 1); }
  };
  return (
    <div className="stepper" {...rest}>
      <button type="button" className="stepper__step" aria-label="Decrease" disabled={value <= min} onClick={() => set(value - 1)}>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5" width="10" height="2" fill="currentColor" /></svg>
      </button>
      <span className="stepper__value" role="spinbutton" tabIndex={0} aria-label={ariaLabel ?? label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} onKeyDown={keys}>{value}</span>
      <button type="button" className="stepper__step" aria-label="Increase" disabled={value >= max} onClick={() => set(value + 1)}>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5" width="10" height="2" fill="currentColor" /><rect x="5" y="1" width="2" height="10" fill="currentColor" /></svg>
      </button>
    </div>
  );
}
