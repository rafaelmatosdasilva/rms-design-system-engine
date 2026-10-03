import './tag.css';
// Positive: Figma uses a green the design system has no variable for (reference only).
export function Tag({ Label = 'New', Tone = 'Neutral' }) {
  return <span className={`tag${Tone === 'Positive' ? ' tag--positive' : ''}`}>{Label}</span>;
}
