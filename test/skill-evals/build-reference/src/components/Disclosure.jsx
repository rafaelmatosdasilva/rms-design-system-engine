import { useState, useId } from 'react';
import './disclosure.css';
export function Disclosure({ Label = 'Details', Content = 'Shipping takes two business days.', Expanded = false, ...rest }) {
  const [open, setOpen] = useState(Expanded === true || Expanded === 'True');
  const panel = useId();
  return (
    <div className="disclosure" {...rest}>
      <button type="button" className="disclosure__trigger" aria-expanded={open ? 'true' : 'false'} aria-controls={panel} onClick={() => setOpen(!open)}>
        <span className="disclosure__label">{Label}</span>
        <svg className="disclosure__chevron" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <div id={panel} className="disclosure__panel" hidden={!open}>{Content}</div>
    </div>
  );
}
