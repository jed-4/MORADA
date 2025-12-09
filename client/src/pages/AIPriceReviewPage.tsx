import { useState, useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import AIPriceListReview, { type AIPriceListReviewHandle } from "@/components/systems/AIPriceListReview";

export default function AIPriceReviewPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const aiReviewRef = useRef<AIPriceListReviewHandle>(null);

  return (
    <div className="flex flex-col h-full" data-testid="ai-price-review-page">
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Price Review</h2>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search line items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 pl-7 text-xs border rounded-md"
              data-testid="input-search-ai-review"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <AIPriceListReview ref={aiReviewRef} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
