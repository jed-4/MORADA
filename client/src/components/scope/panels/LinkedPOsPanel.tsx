import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Package, Plus, X } from "lucide-react";
import type { LinkedPOForStage, ScopeStagePanelProps } from "../types";

export interface LinkedPOsPanelProps extends ScopeStagePanelProps {
  linkedPOs: LinkedPOForStage[];
  allProjectPOs: LinkedPOForStage[];
  onViewPO?: (poId: string) => void;
  onLinkPO?: (poId: string, stageId: string) => void;
  onUnlinkPO?: (poId: string) => void;
}

export function LinkedPOsPanel({
  stageId,
  linkedPOs,
  allProjectPOs,
  onViewPO,
  onLinkPO,
  onUnlinkPO,
}: LinkedPOsPanelProps) {
  const linkablePOs = allProjectPOs.filter(
    (po) => !po.scopeStageId
  );
  const showSection = linkedPOs.length > 0 || linkablePOs.length > 0;
  if (!showSection) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between px-2">
        <div className="text-data font-medium text-muted-foreground uppercase tracking-wide">
          Purchase Orders
        </div>
        {linkablePOs.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover-elevate active-elevate-2"
                title="Link a purchase order to this stage"
              >
                <Plus className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1" align="end">
              <div className="text-table font-medium text-muted-foreground px-2 py-1.5 border-b border-border mb-1">
                Link a PO to this stage
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {linkablePOs.map((po) => (
                  <button
                    key={po.id}
                    className="w-full text-left px-2 py-1.5 rounded hover-elevate active-elevate-2 flex items-center gap-2"
                    onClick={() => onLinkPO?.(po.id, stageId)}
                  >
                    <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{po.poNumber}</div>
                      {(po.title || po.supplierName) && (
                        <div className="text-data text-muted-foreground truncate">
                          {po.title || po.supplierName}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ${(po.total / 100).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {linkedPOs.map((po) => (
        <div
          key={po.id}
          className="h-10 flex items-center gap-3 px-3 rounded-lg border border-border/50 bg-background/80 hover-elevate cursor-pointer group"
          onClick={() => onViewPO?.(po.id)}
          data-testid={`linked-po-${po.id}`}
        >
          <Package className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{po.poNumber}</span>
              <span className={`text-data px-1.5 py-0.5 rounded ${
                po.status === 'paid'
                  ? 'bg-status-success-bg text-status-success'
                  : po.status === 'draft'
                    ? 'bg-muted text-secondary'
                    : po.status === 'cancelled'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-status-warning-bg text-status-warning'
              }`}>
                {po.status.replace('_', ' ')}
              </span>
            </div>
            {(po.title || po.supplierName) && (
              <div className="text-xs text-muted-foreground truncate">
                {po.title && <span>{po.title}</span>}
                {po.title && po.supplierName && <span> - </span>}
                {po.supplierName && <span>{po.supplierName}</span>}
              </div>
            )}
          </div>
          <div className="text-sm font-medium shrink-0">
            ${(po.total / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
          <button
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover-elevate shrink-0"
            title="Unlink PO from this stage"
            onClick={(e) => { e.stopPropagation(); onUnlinkPO?.(po.id); }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default LinkedPOsPanel;
