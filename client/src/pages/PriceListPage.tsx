import { useState, useRef } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PriceList, type PriceListHandle } from "@/components/systems/PriceList";

export default function PriceListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const priceListRef = useRef<PriceListHandle>(null);

  return (
    <div className="flex flex-col h-full" data-testid="price-list-page">
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Price List</h2>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 pl-7 text-xs border rounded-md"
              data-testid="input-search-price-list"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => priceListRef.current?.openAddModal()}
            data-testid="button-add-price-list-item"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <PriceList ref={priceListRef} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
