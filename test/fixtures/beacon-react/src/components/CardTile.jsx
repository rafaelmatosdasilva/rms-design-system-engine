import { forwardRef } from 'react';
import './card.css';

// forwardRef gives an object, not a function. A reader that only accepts functions says "no component exported"
// about every component in a system that takes refs, which is most of them.
export const CardTile = forwardRef(function CardTile({ title = 'A tile' }, ref) {
  return <article ref={ref} className="bc-card"><h3 className="bc-card__title">{title}</h3></article>;
});
