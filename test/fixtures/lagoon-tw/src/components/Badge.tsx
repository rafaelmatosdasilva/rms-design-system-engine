// Lagoon badge (fictional). Its corner is written as a literal the theme does not have.
type Props = { tone?: 'Neutral' | 'Success' | 'Danger'; label?: string };
const TONE = { Neutral: 'text-status-neutral', Success: 'text-status-success', Danger: 'text-status-danger' };
export function Badge({ tone = 'Neutral', label = 'Draft' }: Props) {
  return <span className={`inline-flex items-center h-5 p-2 rounded-[4px] text-xs font-semibold ${TONE[tone]}`}>{label}</span>;
}
