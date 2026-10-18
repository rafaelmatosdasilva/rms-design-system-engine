// Lagoon button (fictional).
type Props = { variant?: 'Primary' | 'Secondary'; size?: 'Small' | 'Large'; label?: string };
export function Button({ variant = 'Primary', size = 'Small', label = 'Continue' }: Props) {
  const look = variant === 'Secondary' ? 'bg-transparent text-action-primary border border-action-primary' : 'bg-action-primary text-action-primary-text';
  return <button type="button" className={`inline-flex items-center h-9 px-3 py-2 rounded-control text-sm ${look}`}>{label}</button>;
}
