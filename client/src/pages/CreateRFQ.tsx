import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  CalendarIcon,
  Building2,
  Trash2,
  Plus,
  Clock,
  ExternalLink,
  X,
} from "lucide-react";
import { type Project, type Supplier, type RfqTemplate } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

export default function CreateRFQ() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    description: "",
    scope: "",
    projectId: "",
    supplierIds: [] as string[],
    supplierNames: [] as string[],
    dueDate: null as Date | null,
    deadline: null as Date | null,
    termsTemplateId: "",
    customTerms: "",
    internalNotes: "",
    isExternal: false,
    externalNotes: "",
    followUpEnabled: false,
    followUpDaysBefore: 3,
    items: [] as { description: string; quantity: string; unit: string; notes: string }[],
  });

  // Auto-populate project from URL when creating from project context
  useEffect(() => {
    if (projectIdFromUrl) {
      setForm(prev => {
        if (prev.projectId !== projectIdFromUrl) {
          return { ...prev, projectId: projectIdFromUrl };
        }
        return prev;
      });
    }
  }, [projectIdFromUrl]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: rfqTemplates = [] } = useQuery<RfqTemplate[]>({
    queryKey: ["/api/rfq-templates"],
  });

  const createRfqMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const rfq = await apiRequest("/api/rfqs", "POST", {
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        scope: data.scope,
        dueDate: data.dueDate?.toISOString(),
        deadline: data.deadline?.toISOString(),
        supplierIds: data.supplierIds,
        supplierNames: data.supplierNames,
        termsTemplateId: data.termsTemplateId || null,
        customTerms: data.customTerms,
        internalNotes: data.internalNotes,
        isExternal: data.isExternal,
        externalNotes: data.externalNotes,
        followUpEnabled: data.followUpEnabled,
        followUpDaysBefore: data.followUpDaysBefore,
        attachmentUrls: [],
      });

      if (data.items.length > 0) {
        await Promise.all(data.items.map((item, index) =>
          apiRequest("/api/rfq-items", "POST", {
            rfqId: rfq.id,
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit,
            notes: item.notes,
            displayOrder: index,
          })
        ));
      }

      return rfq;
    },
    onSuccess: (rfq) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      toast({ title: "RFQ created", description: `Created "${rfq.title}"` });
      setLocation(`/rfqs/${rfq.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to create RFQ", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!form.projectId) {
      toast({ title: "Project required", variant: "destructive" });
      return;
    }
    if (form.supplierIds.length === 0) {
      toast({ title: "Select at least one supplier", variant: "destructive" });
      return;
    }
    createRfqMutation.mutate(form);
  };

  const toggleSupplier = (supplierId: string, supplierName: string) => {
    const isSelected = form.supplierIds.includes(supplierId);
    if (isSelected) {
      setForm(prev => ({
        ...prev,
        supplierIds: prev.supplierIds.filter(id => id !== supplierId),
        supplierNames: prev.supplierNames.filter(n => n !== supplierName),
      }));
    } else {
      setForm(prev => ({
        ...prev,
        supplierIds: [...prev.supplierIds, supplierId],
        supplierNames: [...prev.supplierNames, supplierName],
      }));
    }
  };

  const handleTermsTemplateChange = (templateId: string) => {
    if (templateId === "custom") {
      setForm(prev => ({ ...prev, termsTemplateId: "" }));
      return;
    }
    setForm(prev => ({ ...prev, termsTemplateId: templateId }));
    const template = rfqTemplates.find(t => t.id === templateId);
    if (template?.termsAndConditions) {
      setForm(prev => ({ ...prev, customTerms: template.termsAndConditions || "" }));
    }
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: "", unit: "each", notes: "" }],
    }));
  };

  const updateItem = (index: number, field: string, value: string) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const removeItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/rfqs")}
            className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold">New Request for Quote</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocation("/rfqs")}
            className="h-7 text-xs"
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createRfqMutation.isPending}
            className="h-7 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            data-testid="button-create-rfq"
          >
            {createRfqMutation.isPending ? "Creating..." : "Create RFQ"}
          </Button>
        </div>
      </div>

      {/* Content - Two Column Layout */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main Content (Left) */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Title & Project Row */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Timber Supply for Kitchen Renovation"
                  className="h-8 text-sm"
                  data-testid="input-rfq-title"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Project *</Label>
                <Select
                  value={form.projectId}
                  onValueChange={(v) => setForm(prev => ({ ...prev, projectId: v }))}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid="select-rfq-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        <div className="flex items-center gap-2">
                          <ProjectIcon color={project.color} size="sm" />
                          {project.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Supplier & Date Row */}
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Suppliers */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Suppliers *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                      {form.supplierIds.length > 0
                        ? `${form.supplierIds.length} selected`
                        : "Select suppliers"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {suppliers.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No suppliers found. Add suppliers first.
                        </p>
                      ) : (
                        suppliers.map((supplier) => (
                          <label
                            key={supplier.id}
                            className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={form.supplierIds.includes(supplier.id)}
                              onChange={() => toggleSupplier(supplier.id, supplier.name)}
                              className="rounded"
                            />
                            <span className="text-sm">{supplier.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {form.supplierNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {form.supplierNames.map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {name}
                        <button
                          onClick={() => toggleSupplier(form.supplierIds[i], name)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Response Due</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                      {form.dueDate ? format(form.dueDate, "MMM d, yyyy") : "Set due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.dueDate || undefined}
                      onSelect={(date) => setForm(prev => ({ ...prev, dueDate: date || null }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Work Deadline</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-8 justify-start text-sm font-normal">
                      <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                      {form.deadline ? format(form.deadline, "MMM d, yyyy") : "Set deadline"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.deadline || undefined}
                      onSelect={(date) => setForm(prev => ({ ...prev, deadline: date || null }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of the request..."
              className="min-h-[60px] text-sm"
              data-testid="input-description"
            />
          </Card>

          {/* Scope of Work */}
          <Card className="p-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Scope of Work</Label>
            <Textarea
              value={form.scope}
              onChange={(e) => setForm(prev => ({ ...prev, scope: e.target.value }))}
              placeholder="Detailed scope including specifications, quantities, delivery requirements..."
              className="min-h-[120px] text-sm"
              data-testid="input-scope"
            />
          </Card>

          {/* Line Items */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Line Items ({form.items.length})</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={addItem}
                className="h-6 text-xs"
                data-testid="button-add-item"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Item
              </Button>
            </div>
            {form.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No line items yet. Add items to specify what you need quoted.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-24">Quantity</TableHead>
                    <TableHead className="text-xs w-24">Unit</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, index) => (
                    <TableRow key={index} className="h-10">
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value)}
                          placeholder="Description"
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", e.target.value)}
                          placeholder="0"
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={item.unit} onValueChange={(v) => updateItem(index, "unit", v)}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="each">each</SelectItem>
                            <SelectItem value="m">m</SelectItem>
                            <SelectItem value="m2">m²</SelectItem>
                            <SelectItem value="m3">m³</SelectItem>
                            <SelectItem value="lm">lm</SelectItem>
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="hr">hr</SelectItem>
                            <SelectItem value="lot">lot</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* Terms */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Terms & Conditions</Label>
              <Select value={form.termsTemplateId || "custom"} onValueChange={handleTermsTemplateChange}>
                <SelectTrigger className="w-[180px] h-7 text-xs">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  {rfqTemplates.filter(t => t.termsAndConditions).map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={form.customTerms}
              onChange={(e) => setForm(prev => ({ ...prev, customTerms: e.target.value }))}
              placeholder="Terms and conditions to include in the RFQ..."
              className="min-h-[80px] text-sm"
              data-testid="input-terms"
            />
          </Card>
        </div>

        {/* Sidebar (Right) */}
        <div className="w-80 border-l overflow-auto p-4 space-y-4 bg-muted/10">
          {/* External/Track Only Toggle */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Track Only Mode</Label>
                <p className="text-[10px] text-muted-foreground">
                  Track RFQ sent outside BuildPro
                </p>
              </div>
              <Switch
                checked={form.isExternal}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, isExternal: checked }))}
              />
            </div>
            {form.isExternal && (
              <Textarea
                value={form.externalNotes}
                onChange={(e) => setForm(prev => ({ ...prev, externalNotes: e.target.value }))}
                placeholder="Where was this RFQ sent? (email, phone, etc.)"
                className="text-xs min-h-[60px]"
              />
            )}
          </Card>

          {/* Follow-up Reminders */}
          <Card className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Auto Follow-up</Label>
                <p className="text-[10px] text-muted-foreground">
                  Send reminder before due date
                </p>
              </div>
              <Switch
                checked={form.followUpEnabled}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, followUpEnabled: checked }))}
              />
            </div>
            {form.followUpEnabled && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Days before due date</Label>
                <Select
                  value={form.followUpDaysBefore.toString()}
                  onValueChange={(v) => setForm(prev => ({ ...prev, followUpDaysBefore: parseInt(v) }))}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day before</SelectItem>
                    <SelectItem value="3">3 days before</SelectItem>
                    <SelectItem value="5">5 days before</SelectItem>
                    <SelectItem value="7">7 days before</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          {/* Internal Notes */}
          <Card className="p-3 space-y-2">
            <Label className="text-xs font-medium">Internal Notes</Label>
            <p className="text-[10px] text-muted-foreground">
              Only visible to your team
            </p>
            <Textarea
              value={form.internalNotes}
              onChange={(e) => setForm(prev => ({ ...prev, internalNotes: e.target.value }))}
              placeholder="Notes for your team..."
              className="text-xs min-h-[100px]"
              data-testid="input-internal-notes"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
