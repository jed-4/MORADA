import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Check, X, Search, User, Building2, Wrench, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AssigneeSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
  "data-testid"?: string;
}

interface AssigneeOption {
  value: string;
  label: string;
  description?: string;
}

interface Section {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: AssigneeOption[];
}

export function AssigneeSelect({
  value,
  onValueChange,
  placeholder = "Select assignee...",
  allowClear = false,
  className,
  "data-testid": testId,
}: AssigneeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const { data: authUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const { data: assignableUsers = [] } = useQuery<any[]>({ queryKey: ["/api/users/assignable"] });
  const { data: allContacts = [] } = useQuery<any[]>({ queryKey: ["/api/contacts"] });

  const sections: Section[] = useMemo(() => {
    const companyItems: AssigneeOption[] = [];

    if (authUser?.companyId) {
      companyItems.push({
        value: `company:${authUser.companyId}`,
        label: authUser.companyNickname || "The Business",
        description: "Assign to your business",
      });
    }

    for (const u of assignableUsers) {
      const label = u.displayName || u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Team member";
      companyItems.push({
        value: `user:${u.id}`,
        label,
        description: u.email || undefined,
      });
    }

    const trades = allContacts
      .filter((c: any) => c.contactType === "subcontractor")
      .map((c: any) => {
        const company = (c.company || "").trim();
        const name = (c.name || "").trim();
        const label = company && name && company.toLowerCase() !== name.toLowerCase()
          ? `${company} - ${name}`
          : company || name || "Unnamed";
        return { value: c.id, label, description: c.email || undefined };
      });

    const suppliers = allContacts
      .filter((c: any) => c.contactType === "supplier")
      .map((c: any) => {
        const company = (c.company || "").trim();
        const name = (c.name || "").trim();
        const label = company && name && company.toLowerCase() !== name.toLowerCase()
          ? `${company} - ${name}`
          : company || name || "Unnamed";
        return { value: c.id, label, description: c.email || undefined };
      });

    return [
      { key: "company", label: "Company", icon: <Building2 className="h-3.5 w-3.5" />, items: companyItems },
      { key: "trades", label: "Trades", icon: <Wrench className="h-3.5 w-3.5" />, items: trades },
      { key: "suppliers", label: "Suppliers", icon: <Package className="h-3.5 w-3.5" />, items: suppliers },
    ];
  }, [authUser, assignableUsers, allContacts]);

  const q = search.toLowerCase().trim();

  const filteredSections = useMemo(() =>
    sections.map(section => ({
      ...section,
      items: q
        ? section.items.filter(item =>
            item.label.toLowerCase().includes(q) ||
            (item.description || "").toLowerCase().includes(q)
          )
        : section.items,
    })),
    [sections, q]
  );

  const selectedLabel = useMemo(() => {
    for (const section of sections) {
      const found = section.items.find(i => i.value === value);
      if (found) return found.label;
    }
    return null;
  }, [sections, value]);

  const toggleSection = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelect = (optValue: string) => {
    onValueChange(optValue === value ? "" : optValue);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !selectedLabel && "text-muted-foreground", className)}
          data-testid={testId}
        >
          <span className="truncate flex items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {selectedLabel || placeholder}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {allowClear && value && (
              <X className="h-3 w-3 opacity-50 hover:opacity-100" onClick={handleClear} />
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assignees..."
              className="pl-7 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filteredSections.every(s => s.items.length === 0) && (
            <div className="py-4 text-center text-sm text-muted-foreground">No results found.</div>
          )}
          {filteredSections.map(section => {
            if (section.items.length === 0) return null;
            const isOpen = !(collapsed[section.key] ?? false);
            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover-elevate transition-colors"
                >
                  {isOpen
                    ? <ChevronDown className="h-3 w-3 shrink-0" />
                    : <ChevronRight className="h-3 w-3 shrink-0" />
                  }
                  {section.icon}
                  {section.label}
                  <span className="ml-auto text-[10px] font-normal normal-case tracking-normal opacity-60">
                    {section.items.length}
                  </span>
                </button>
                {isOpen && section.items.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleSelect(item.value)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 pl-8 text-sm hover-elevate transition-colors text-left"
                    data-testid={`assignee-option-${item.value}`}
                  >
                    <Check
                      className={cn("h-3.5 w-3.5 shrink-0", value === item.value ? "opacity-100 text-primary" : "opacity-0")}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{item.label}</span>
                      {item.description && (
                        <span className="text-[10px] text-muted-foreground truncate">{item.description}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
