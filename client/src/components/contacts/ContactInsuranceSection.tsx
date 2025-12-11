import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type ContactInsurance } from "@shared/schema";
import { format, differenceInDays } from "date-fns";

const insuranceFormSchema = z.object({
  insuranceType: z.enum(["public_liability", "workers_compensation", "professional_indemnity", "contractors_all_risk", "other"]),
  expiryDate: z.string().optional(),
  policyNumber: z.string().optional(),
  insurerName: z.string().optional(),
  documentUrl: z.string().optional(),
  notes: z.string().optional(),
});

type InsuranceFormValues = z.infer<typeof insuranceFormSchema>;

type ContactInsuranceSectionProps = {
  contactId: string;
  contactName: string;
};

export function ContactInsuranceSection({ contactId, contactName }: ContactInsuranceSectionProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState<ContactInsurance | null>(null);

  const form = useForm<InsuranceFormValues>({
    resolver: zodResolver(insuranceFormSchema),
    defaultValues: {
      insuranceType: "public_liability",
      expiryDate: "",
      policyNumber: "",
      insurerName: "",
      documentUrl: "",
      notes: "",
    },
  });

  const { data: insurances = [], isLoading } = useQuery<ContactInsurance[]>({
    queryKey: ["/api/contacts", contactId, "insurances"],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contactId}/insurances`);
      if (!response.ok) throw new Error("Failed to fetch insurances");
      return response.json();
    },
    enabled: !!contactId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsuranceFormValues) => {
      return await apiRequest(`/api/contacts/${contactId}/insurances`, "POST", {
        ...data,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "insurances"] });
      toast({ title: "Success", description: "Insurance added successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add insurance", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsuranceFormValues> }) => {
      return await apiRequest(`/api/contact-insurances/${id}`, "PATCH", {
        ...data,
        expiryDate: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "insurances"] });
      toast({ title: "Success", description: "Insurance updated successfully" });
      setIsDialogOpen(false);
      setEditingInsurance(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update insurance", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/contact-insurances/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId, "insurances"] });
      toast({ title: "Success", description: "Insurance deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete insurance", variant: "destructive" });
    },
  });

  const handleAddInsurance = () => {
    setEditingInsurance(null);
    form.reset({
      insuranceType: "public_liability",
      expiryDate: "",
      policyNumber: "",
      insurerName: "",
      documentUrl: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleEditInsurance = (insurance: ContactInsurance) => {
    setEditingInsurance(insurance);
    form.reset({
      insuranceType: insurance.insuranceType as InsuranceFormValues["insuranceType"],
      expiryDate: insurance.expiryDate ? format(new Date(insurance.expiryDate), "yyyy-MM-dd") : "",
      policyNumber: insurance.policyNumber || "",
      insurerName: insurance.insurerName || "",
      documentUrl: insurance.documentUrl || "",
      notes: insurance.notes || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: InsuranceFormValues) => {
    if (editingInsurance) {
      updateMutation.mutate({ id: editingInsurance.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getInsuranceStatusBadge = (expiryDate: string | Date | null | undefined) => {
    if (!expiryDate) {
      return <Badge variant="outline" className="text-muted-foreground">No expiry</Badge>;
    }
    const days = differenceInDays(new Date(expiryDate), new Date());
    if (days < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (days <= 30) {
      return <Badge className="bg-amber-500 hover:bg-amber-600">Expires in {days} days</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-600">Valid</Badge>;
  };

  const getInsuranceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      public_liability: "Public Liability",
      workers_compensation: "Workers Compensation",
      professional_indemnity: "Professional Indemnity",
      contractors_all_risk: "Contractors All Risk",
      other: "Other",
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-3" data-testid="section-contact-insurances">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Insurance Documents
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddInsurance}
          data-testid="button-add-insurance"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : insurances.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No insurance documents. Add insurance to track expiry dates.
        </p>
      ) : (
        <div className="space-y-2">
          {insurances.map((insurance) => (
            <div
              key={insurance.id}
              className="flex items-center justify-between p-3 border rounded-md hover-elevate"
              data-testid={`insurance-item-${insurance.id}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{getInsuranceTypeLabel(insurance.insuranceType)}</span>
                  {getInsuranceStatusBadge(insurance.expiryDate)}
                </div>
                {insurance.insurerName && (
                  <p className="text-xs text-muted-foreground">{insurance.insurerName}</p>
                )}
                {insurance.expiryDate && (
                  <p className="text-xs text-muted-foreground">
                    Expires: {format(new Date(insurance.expiryDate), "dd/MM/yyyy")}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid={`button-insurance-actions-${insurance.id}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditInsurance(insurance)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(insurance.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDialogOpen(false);
          setEditingInsurance(null);
        }
      }}>
        <DialogContent className="max-w-md" data-testid="dialog-insurance">
          <DialogHeader>
            <DialogTitle>{editingInsurance ? "Edit Insurance" : "Add Insurance"}</DialogTitle>
            <DialogDescription>
              {editingInsurance ? "Update insurance details" : "Add insurance documentation for this supplier"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="insuranceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-insurance-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="public_liability">Public Liability</SelectItem>
                        <SelectItem value="workers_compensation">Workers Compensation</SelectItem>
                        <SelectItem value="professional_indemnity">Professional Indemnity</SelectItem>
                        <SelectItem value="contractors_all_risk">Contractors All Risk</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="insurerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Insurance company" {...field} data-testid="input-insurer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="policyNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Policy Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Policy number" {...field} data-testid="input-policy-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-expiry-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="documentUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document URL</FormLabel>
                    <FormControl>
                      <Input placeholder="Link to insurance document" {...field} data-testid="input-document-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Additional notes" {...field} data-testid="textarea-insurance-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-insurance"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingInsurance ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
