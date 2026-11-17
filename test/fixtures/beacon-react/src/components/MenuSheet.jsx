import { useState } from 'react';
import { createPortal } from 'react-dom';
import './menu.css';

// Draws its sheet through a portal, into the page's own body. The stand-in has no portal, so the sheet never exists
// and a check of it reads the component as having nothing to show.
export function MenuSheet({ label = 'More', items = ['Rename', 'Duplicate', 'Delete'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bc-menu">
      <button type="button" className="bc-menu__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open
        ? createPortal(
          <ul className="bc-menu__sheet" role="menu">
            {items.map((item) => <li key={item} role="menuitem" className="bc-menu__item">{item}</li>)}
          </ul>,
          document.body,
        )
        : null}
    </div>
  );
}
