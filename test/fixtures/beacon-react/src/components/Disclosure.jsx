import { useState } from 'react';
import './disclosure.css';

// Keeps its own state: the stand-in renders once and never sees it open.
export function Disclosure({ label = 'Details', children = 'The panel.' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bc-disclosure">
      <button type="button" className="bc-disclosure__summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open ? <div className="bc-disclosure__panel">{children}</div> : null}
    </div>
  );
}
