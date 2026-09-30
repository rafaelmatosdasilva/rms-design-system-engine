// A Lagoon page (fictional): two values written in brackets that the theme already has.
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
export function Settings() {
  return (
    <main className="bg-surface-base text-text-default p-[12px] data-[state=open]:block">
      <Badge tone="Success" label="Synced" />
      <p className="bg-[#1f7a3a]/10 rounded-control">Saved</p>
      <Button label="Save" />
    </main>
  );
}
