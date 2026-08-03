import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { CalendarIcon, Check, Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Contact, Project } from "@shared/schema";
import { cn } from "@/lib/utils";

/**
 * Log an RFQ in seconds — title, who you asked, when you need it back.
 *
 * The registry only works if adding to it is trivial. The full create page
 * asks for a project, scope and line items up front, which is the right form
 * for a formal RFQ document and the wrong one for "I just rang three
 * concreters, record it so I remember to chase them".
 *
 * Project is optional here on purpose; it can be attached later once the job
 * is real.
 */
const NO_PROJECT = "__none__";

export function QuickCreateRfqDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? NO_PROJECT);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"], enabled: open });
  const { data: allContacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"], enabled: open });

  const suppliers = useMemo(
    () =>
      allContacts.filter(
        (c: any) => (c.contactType === "supplier" || c.contactType === "trade") && !c.isArchived,
      ),
    [allContacts],
  );

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return suppliers.filter((s) => (s.name ?? "").toLowerCase().includes(q));
  }, [suppliers, supplierSearch]);

  const reset = () => {
    setTitle("");
    setProjectId(defaultProjectId ?? NO_PROJECT);
    setDueDate(null);
    setSelected([]);
    setSupplierSearch("");
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/rfqs", "POST", {
        title: title.trim(),
        projectId: projectId === NO_PROJECT ? null : projectId,
        dueDate: dueDate?.toISOString() ?? null,
        supplierIds: selected.map((s) => s.id),
        supplierNames: selected.map((s) => s.name ?? ""),
      }),
    onSuccess: (rfq: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-recipients"] });
      toast({ title: `${rfq.rfqNumber} created` });
      onOpenChange(false);
      reset();
      setLocation(rfq.projectId ? `/projects/${rfq.projectId}/rfqs/${rfq.id}` : `/rfqs/${rfq.id}`);
    },
    onError: (error: any) =>
      toast({ title: "Could not create RFQ", description: error.message, variant: "destructive" }),
  });

  const toggleSupplier = (supplier: Contact) => {
    setSelected((prev) =>
      prev.some((s) => s.id === supplier.id)
        ? prev.filter((s) => s.id !== supplier.id)
        : [...prev, supplier],
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="dialog-quick-create-rfq">
        <DialogHeader>
          <DialogTitle>Log an RFQ</DialogTitle>
          <DialogDescription>
            Record a quote request so the team can see it and chase it. Scope and line items can
            come later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">What are you quoting?</Label>
            <Input
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim() && !createMutation.isPending) {
                  createMutation.mutate();
                }
              }}
              placeholder="e.g. Concrete supply — slab and footings"
              data-testid="input-quick-rfq-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-quick-rfq-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Deliberately first and deliberately not "none" — logging an
                      enquiry with no job attached is a first-class use. */}
                  <SelectItem value={NO_PROJECT}>General — no project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Response due</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-9 justify-start text-sm font-normal"
                    data-testid="button-quick-rfq-due"
                  >
                    <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                    {dueDate ? format(dueDate, "d MMM yyyy") : "Optional"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate ?? undefined}
                    onSelect={(d) => setDueDate(d ?? null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Who did you ask?</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Search suppliers..."
                className="h-8 pl-7 text-sm"
                data-testid="input-quick-rfq-supplier-search"
              />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selected.map((s) => (
                  <Badge key={s.id} variant="secondary" className="text-xs gap-1">
                    {s.name}
                    <button
                      type="button"
                      onClick={() => toggleSupplier(s)}
                      className="hover:text-destructive"
                      aria-label={`Remove ${s.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="border rounded-md max-h-[160px] overflow-y-auto divide-y divide-border/40">
              {filteredSuppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {suppliers.length === 0 ? "No suppliers in Contacts yet." : "No suppliers match."}
                </p>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const on = selected.some((s) => s.id === supplier.id);
                  return (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => toggleSupplier(supplier)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover-elevate",
                        on && "bg-primary/10",
                      )}
                      data-testid={`option-quick-supplier-${supplier.id}`}
                    >
                      <span className="truncate">{supplier.name}</span>
                      {on && <Check className="w-3 h-3 flex-shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="button-quick-rfq-create"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create RFQ"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
