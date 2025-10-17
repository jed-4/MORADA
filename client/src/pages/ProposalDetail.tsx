import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft, 
  Save, 
  Send,
  FileText,
  Loader2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  type Proposal, 
  type Project, 
  type Estimate,
  type InsertProposal,
  insertProposalSchema 
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface ProposalDetailParams {
  id?: string;
}

export default function ProposalDetail() {
  const params = useParams<ProposalDetailParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  
  const isNewProposal = !params.id;
  
  // Fetch proposal if editing
  const { data: proposal, isLoading: proposalLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals", params.id],
    queryFn: async () => {
      const response = await fetch(`/api/proposals/${params.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch proposal");
      return response.json();
    },
    enabled: !isNewProposal,
  });

  // Fetch all projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch all estimates
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  // Form with validation
  const form = useForm<InsertProposal>({
    resolver: zodResolver(insertProposalSchema),
    defaultValues: proposal || {
      name: "",
      proposalNumber: `PROP-${Date.now()}`,
      projectId: "",
      status: "draft",
      subtotal: 0,
      gstAmount: 0,
      totalAmount: 0,
      introductionText: null,
      closingText: null,
      termsAndConditions: null,
      estimateId: null,
      clientId: null,
      expiryDate: null,
      sentDate: null,
      viewedDate: null,
      acceptedDate: null,
      acceptedBy: null,
      acceptedByName: null,
      acceptedByEmail: null,
      signature: null,
      rejectedDate: null,
      rejectionReason: null,
      convertedToInvoiceId: null,
      convertedDate: null,
      showPricing: true,
      notes: null,
      createdBy: null,
      createdByName: null,
      isDeleted: false,
    },
  });

  // Create/Update proposal mutation
  const saveMutation = useMutation({
    mutationFn: async (data: InsertProposal) => {
      if (isNewProposal) {
        return await apiRequest("/api/proposals", "POST", data);
      } else {
        return await apiRequest(`/api/proposals/${params.id}`, "PATCH", data);
      }
    },
    onSuccess: (savedProposal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Success",
        description: `Proposal ${isNewProposal ? "created" : "updated"} successfully.`,
      });
      if (isNewProposal) {
        setLocation(`/proposals/${savedProposal.id}`);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save proposal.",
        variant: "destructive",
      });
    },
  });

  // Import from estimate
  const importFromEstimateMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      const estimate = estimates.find(e => e.id === estimateId);
      if (!estimate) throw new Error("Estimate not found");

      // Fetch estimate items
      const itemsResponse = await fetch(`/api/estimates/${estimateId}/items`, {
        credentials: "include",
      });
      const items = await itemsResponse.json();

      // Calculate totals
      const subtotal = items.reduce((sum: number, item: any) => sum + item.totalAmount, 0);
      const gstAmount = items.reduce((sum: number, item: any) => sum + (item.totalAmount * (item.taxRate || 0) / 100), 0);

      return {
        estimate,
        items,
        subtotal,
        gstAmount,
        total: subtotal + gstAmount,
      };
    },
    onSuccess: (data) => {
      form.setValue("estimateId", data.estimate.id);
      form.setValue("projectId", data.estimate.projectId);
      form.setValue("name", `Proposal for ${data.estimate.name}`);
      form.setValue("subtotal", data.subtotal);
      form.setValue("gstAmount", data.gstAmount);
      form.setValue("totalAmount", data.total);
      
      toast({
        title: "Success",
        description: "Estimate data imported successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to import estimate.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertProposal) => {
    saveMutation.mutate(data);
  };

  if (proposalLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/proposals")}
              data-testid="button-back-to-proposals"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold" data-testid="text-proposal-heading">
                {isNewProposal ? "New Proposal" : "Edit Proposal"}
              </h1>
              {proposal && (
                <p className="text-sm text-muted-foreground mt-1">
                  {proposal.proposalNumber}
                </p>
              )}
            </div>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={saveMutation.isPending}
              data-testid="button-save-proposal"
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Import from Estimate */}
          {isNewProposal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Import from Estimate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Select
                    value={selectedEstimateId || ""}
                    onValueChange={(value) => setSelectedEstimateId(value)}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-estimate">
                      <SelectValue placeholder="Select an estimate" />
                    </SelectTrigger>
                    <SelectContent>
                      {estimates.map((estimate) => {
                        const project = projects.find(p => p.id === estimate.projectId);
                        return (
                          <SelectItem key={estimate.id} value={estimate.id}>
                            {estimate.name} {project && `(${project.name})`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => selectedEstimateId && importFromEstimateMutation.mutate(selectedEstimateId)}
                    disabled={!selectedEstimateId || importFromEstimateMutation.isPending}
                    data-testid="button-import-estimate"
                  >
                    {importFromEstimateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Import"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Proposal Details */}
          <Card>
            <CardHeader>
              <CardTitle>Proposal Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-project">
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proposal Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-proposal-name" />
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
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            rows={4}
                            data-testid="textarea-proposal-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="subtotal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subtotal</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              data-testid="input-subtotal"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="gstAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GST Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              value={field.value || 0}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              data-testid="input-gst-amount"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="totalAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              data-testid="input-total-amount"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Coming Soon: Sections & Items */}
          <Card>
            <CardHeader>
              <CardTitle>Sections & Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Section and item management coming soon. For now, proposals will use the data imported from estimates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
