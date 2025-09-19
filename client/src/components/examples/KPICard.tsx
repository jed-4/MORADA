import KPICard from '../KPICard';
import { DollarSign } from 'lucide-react';

export default function KPICardExample() {
  return (
    <div className="p-4 max-w-sm">
      <KPICard
        title="Total Budget"
        value="$750,000"
        change={{ value: "+12%", direction: "up" }}
        icon={<DollarSign className="h-4 w-4" />}
      />
    </div>
  );
}