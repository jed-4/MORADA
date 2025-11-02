import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Package, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  estimatedCost: number;
}

interface CatalogSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAssembly: (assemblyId: string) => void;
}

export function CatalogSidebar({ isOpen, onClose, onAddAssembly }: CatalogSidebarProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock catalog data - in real app, fetch from Systems Library
  const mockCatalog: CatalogItem[] = [
    {
      id: "assembly-1",
      name: "Slab Pour",
      description: "Complete slab foundation package",
      itemCount: 5,
      estimatedCost: 12500,
    },
    {
      id: "assembly-2",
      name: "Framing Package",
      description: "Timber frame materials and labor",
      itemCount: 8,
      estimatedCost: 28000,
    },
    {
      id: "assembly-3",
      name: "Electrical Rough-In",
      description: "First fix electrical",
      itemCount: 12,
      estimatedCost: 8500,
    },
    {
      id: "assembly-4",
      name: "Plumbing Rough-In",
      description: "First fix plumbing",
      itemCount: 10,
      estimatedCost: 6800,
    },
    {
      id: "assembly-5",
      name: "Kitchen Fitout",
      description: "Standard kitchen package",
      itemCount: 15,
      estimatedCost: 18000,
    },
  ];

  const filteredCatalog = mockCatalog.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <Card 
      className="catalog-sidebar w-80 h-full flex flex-col"
      data-testid="catalog-sidebar"
    >
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Assembly Catalog</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-close-catalog"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assemblies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-catalog"
          />
        </div>
      </div>

      {/* Catalog Items */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {filteredCatalog.map((item) => (
            <div
              key={item.id}
              className="catalog-item-draggable p-3 rounded-md border cursor-pointer"
              onClick={() => onAddAssembly(item.id)}
              data-testid={`catalog-item-${item.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-sm">{item.name}</h4>
                <Badge variant="secondary" className="text-xs">
                  {item.itemCount} items
                </Badge>
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground mb-2">
                  {item.description}
                </p>
              )}
              <div className="text-xs font-medium text-primary">
                Est. ${(item.estimatedCost / 100).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        {filteredCatalog.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No assemblies found
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t text-xs text-muted-foreground">
        <p>💡 Click an assembly to add its items to your estimate</p>
      </div>
    </Card>
  );
}
