import './chip.css';
export function Chip({ Label = 'Filter', Size = 'M', Icon = false, pressed = false, ...rest }) {
  return (
    <button type="button" className={`chip${Size === 'L' ? ' chip--l' : ''}`} aria-pressed={pressed ? 'true' : 'false'} {...rest}>
      {Icon && <span className="chip__icon" aria-hidden="true" />}
      <span>{Label}</span>
    </button>
  );
}
