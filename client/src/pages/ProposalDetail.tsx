import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { 
  type Proposal, 
  type ProposalSection,
  type Project,
  type InsertProposal,
  type InsertProposalSection,
  insertProposalSchema 
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ProposalBuilder } from "@/components/proposals/ProposalBuilder";

interface ProposalDetailParams {
  id?: string;
}

const SECTION_TYPES = [
  { value: 'cover_page', label: 'Cover Page' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'summary', label: 'Summary' },
  { value: 'allowances', label: 'Allowances' },
  { value: 'closing_letter', label: 'Closing Letter' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'terms_conditions', label: 'Terms & Conditions' },
  { value: 'signature', label: 'Signature' },
  { value: 'custom', label: 'Custom Section' },
];

export default function ProposalDetail() {
  const params = useParams<ProposalDetailParams>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [isAddingSectionOpen, setIsAddingSectionOpen] = useState(false);
  const [newSectionType, setNewSectionType] = useState('custom');
  const [newSectionName, setNewSectionName] = useState('');
  
  const isNewProposal = !params.id;
  
  // Fetch proposal
  const { data: proposal, isLoading: proposalLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals", params.id],
    enabled: !isNewProposal,
  });

  // Fetch proposal sections
  const { data: sections = [], isLoading: sectionsLoading } = useQuery<ProposalSection[]>({
    queryKey: ["/api/proposals", params.id, "sections"],
    enabled: !isNewProposal && !!params.id,
  });

  // Fetch projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch company settings
  const { data: companySettings } = useQuery({
    queryKey: ["/api/company-settings"],
  });

  // Form for proposal details
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
      showPricing: true,
    },
  });

  // Update proposal mutation
  const updateProposalMutation = useMutation({
    mutationFn: async (data: Partial<InsertProposal>) => {
      if (isNewProposal) {
        const result = await apiRequest("/api/proposals", "POST", data);
        // Navigate to the edit page after creation
        if (result.id) {
          setLocation(`/proposals/${result.id}`);
        }
        return result;
      } else {
        return await apiRequest(`/api/proposals/${params.id}`, "PATCH", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      toast({
        title: "Success",
        description: "Proposal saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save proposal.",
        variant: "destructive",
      });
    },
  });

  // Local state for optimistic updates
  const [localSections, setLocalSections] = useState<ProposalSection[]>([]);

  // Sync local sections with server data
  useEffect(() => {
    if (sections) {
      setLocalSections(sections);
    }
  }, [sections]);

  // Reorder sections mutation
  const reorderSectionsMutation = useMutation({
    mutationFn: async (reorderedSections: ProposalSection[]) => {
      // Update each section's order
      await Promise.all(
        reorderedSections.map((section) =>
          apiRequest(`/api/proposals/${params.id}/sections/${section.id}`, "PATCH", {
            order: section.order,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id, "sections"] });
    },
  });

  // Add section mutation
  const addSectionMutation = useMutation({
    mutationFn: async (sectionData: Partial<InsertProposalSection>) => {
      return await apiRequest(`/api/proposals/${params.id}/sections`, "POST", {
        ...sectionData,
        proposalId: params.id,
        order: sections.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", params.id, "sections"] });
      setIsAddingSectionOpen(false);
      setNewSectionName('');
      setNewSectionType('custom');
      toast({
        title: "Success",
        description: "Section added successfully.",
      });
    },
  });

  const handleSectionsReorder = (reorderedSections: ProposalSection[]) => {
    // Optimistic update
    setLocalSections(reorderedSections);
    // Persist to server
    reorderSectionsMutation.mutate(reorderedSections);
  };

  const handleSectionEdit = (section: ProposalSection) => {
    setEditingSectionId(section.id);
    // TODO: Open section editor dialog
  };

  const handleAddSection = () => {
    setIsAddingSectionOpen(true);
  };

  const handleCreateSection = () => {
    if (!newSectionName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a section name.",
        variant: "destructive",
      });
      return;
    }

    addSectionMutation.mutate({
      name: newSectionName,
      sectionType: newSectionType,
      description: '',
    });
  };

  const handleSave = () => {
    const data = form.getValues();
    updateProposalMutation.mutate(data);
  };

  if (proposalLoading || sectionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isNewProposal && !proposal) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Proposal not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-background p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/proposals')}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {isNewProposal ? 'New Proposal' : proposal?.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isNewProposal ? 'Create a new proposal' : `#${proposal?.proposalNumber}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={handleSave}
              disabled={updateProposalMutation.isPending}
              data-testid="button-save"
            >
              {updateProposalMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Quick settings */}
        <Form {...form}>
          <div className="flex gap-4 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      placeholder="Proposal name"
                      {...field}
                      data-testid="input-proposal-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem className="w-64">
                  <Select
                    value={field.value || ''}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder="Select project" />
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
          </div>
        </Form>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden p-4">
        {isNewProposal ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Save the proposal first to start building
              </p>
              <Button onClick={handleSave} data-testid="button-save-first">
                Save & Continue
              </Button>
            </div>
          </div>
        ) : (
          <ProposalBuilder
            proposal={proposal!}
            sections={localSections}
            onSectionsReorder={handleSectionsReorder}
            onSectionEdit={handleSectionEdit}
            onAddSection={handleAddSection}
            companyLogo={companySettings?.logoUrl}
            companyName={companySettings?.companyName}
          />
        )}
      </div>

      {/* Add Section Dialog */}
      <Dialog open={isAddingSectionOpen} onOpenChange={setIsAddingSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
            <DialogDescription>
              Choose the type of section you want to add to your proposal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Section Type</label>
              <Select value={newSectionType} onValueChange={setNewSectionType}>
                <SelectTrigger data-testid="select-section-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Section Name</label>
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="Enter section name..."
                data-testid="input-section-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAddingSectionOpen(false)}
                data-testid="button-cancel-section"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSection}
                disabled={addSectionMutation.isPending}
                data-testid="button-create-section"
              >
                {addSectionMutation.isPending ? 'Adding...' : 'Add Section'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
