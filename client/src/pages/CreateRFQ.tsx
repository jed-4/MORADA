import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowLeft, CalendarIcon, Building2, Trash2, Plus } from "lucide-react";
import { type Project, type Supplier } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";

export default function CreateRFQ() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    description: "",
    projectId: "",
    supplierIds: [] as string[],
    scope: "",
    dueDate: null as Date | null,
    items: [] as { description: string; quantity: string; unit: string }[],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const createRfqMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const selectedSuppliers = suppliers.filter(s => data.supplierIds.includes(s.id));
      const supplierNames = selectedSuppliers.map(s => s.name);
      
      const rfq = await apiRequest("/api/rfqs", "POST", {
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        scope: data.scope,
        dueDate: data.dueDate?.toISOString(),
        supplierIds: data.supplierIds,
        supplierNames,
        attachmentUrls: [],
      });

      if (data.items.length > 0) {
        await Promise.all(data.items.map((item, index) =>
          apiRequest("/api/rfq-items", "POST", {
            rfqId: rfq.id,
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit,
            notes: "",
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

  const toggleSupplier = (supplierId: string) => {
    setForm(prev => ({
      ...prev,
      supplierIds: prev.supplierIds.includes(supplierId)
        ? prev.supplierIds.filter(id => id !== supplierId)
        : [...prev.supplierIds, supplierId],
    }));
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: "", unit: "each" }],
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
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/rfqs")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Create Request for Quote
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/rfqs")}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createRfqMutation.isPending}
            className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white"
            data-testid="button-create-rfq"
          >
            {createRfqMutation.isPending ? "Creating..." : "Create RFQ"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Basic Info Card */}
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-medium">Basic Information</h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rfq-title" className="text-xs">Title *</Label>
                <Input
                  id="rfq-title"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Timber Supply for Kitchen Renovation"
                  className="h-8 text-sm"
                  data-testid="input-rfq-title"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Project *</Label>
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

              <div className="space-y-1.5">
                <Label className="text-xs">Response Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full h-8 text-sm justify-start font-normal" 
                      data-testid="button-rfq-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.dueDate ? format(form.dueDate, "PPP") : "Pick a date"}
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rfq-description" className="text-xs">Description</Label>
              <Textarea
                id="rfq-description"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what you're requesting"
                className="text-sm min-h-[60px]"
                data-testid="input-rfq-description"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rfq-scope" className="text-xs">Scope of Work</Label>
              <Textarea
                id="rfq-scope"
                value={form.scope}
                onChange={(e) => setForm(prev => ({ ...prev, scope: e.target.value }))}
                placeholder="Detailed scope including specifications, quantities, delivery requirements..."
                className="text-sm min-h-[100px]"
                data-testid="input-rfq-scope"
              />
            </div>
          </Card>

          {/* Suppliers Card */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Suppliers *</h3>
              {form.supplierIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {form.supplierIds.length} selected
                </span>
              )}
            </div>
            
            <div className="border rounded-md p-2 max-h-[200px] overflow-y-auto space-y-1">
              {suppliers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No suppliers found. Add suppliers in the Suppliers page first.
                </p>
              ) : (
                suppliers.map((supplier) => (
                  <label
                    key={supplier.id}
                    className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                    data-testid={`checkbox-supplier-${supplier.id}`}
                  >
                    <Checkbox
                      checked={form.supplierIds.includes(supplier.id)}
                      onCheckedChange={() => toggleSupplier(supplier.id)}
                    />
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{supplier.name}</span>
                    {supplier.email && (
                      <span className="text-xs text-muted-foreground ml-auto">{supplier.email}</span>
                    )}
                  </label>
                ))
              )}
            </div>
          </Card>

          {/* Line Items Card */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Line Items</h3>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addItem}
                className="h-7 text-xs"
                data-testid="button-add-rfq-item"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>

            {form.items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No line items added. You can add specific items you need pricing for, or leave empty for general quotes.
              </p>
            ) : (
              <div className="space-y-2">
                {form.items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-start p-2 bg-muted/30 rounded">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Description"
                      className="flex-1 h-8 text-sm"
                      data-testid={`input-item-description-${index}`}
                    />
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      placeholder="Qty"
                      className="w-20 h-8 text-sm"
                      data-testid={`input-item-quantity-${index}`}
                    />
                    <Select value={item.unit} onValueChange={(v) => updateItem(index, "unit", v)}>
                      <SelectTrigger className="w-24 h-8 text-sm">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeItem(index)}
                      data-testid={`button-remove-item-${index}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
