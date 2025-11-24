import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertProjectSchema, InsertProject, Project, type FieldCategoryWithOptions } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";

type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const formSchema = insertProjectSchema.extend({
  color: insertProjectSchema.shape.color.default("#3b82f6"),
});

type FormData = {
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  invoicingMethod: "progress_payments" | "cost_plus";
  projectSubStatus: string;
};

export default function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { toast } = useToast();
  const { setCurrentProject } = useProject();
  
  // Fetch status options
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const projectStatusCategory = fieldCategories.find(cat => cat.key === "project.status");
  const statusOptions = projectStatusCategory?.options || [];
  // Get all child (detailed) status options
  const detailedStatusOptions = statusOptions.filter(opt => opt.parentId !== null && opt.parentId !== undefined);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3b82f6",
      isActive: true,
      invoicingMethod: "progress_payments",
      projectSubStatus: "lead_new",
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      return await apiRequest("/api/projects", "POST", data) as Project;
    },
    onSuccess: (newProject) => {
      // Invalidate and refetch projects
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      
      // Set the new project as current
      setCurrentProject(newProject);
      
      // Reset form and close dialog
      form.reset();
      onOpenChange(false);
      
      toast({
        title: "Project created successfully",
        description: `${newProject.name} has been added to your projects.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create project",
        description: error.message || "An error occurred while creating the project.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    // Find the selected status to get its parent (phase)
    const selectedStatus = statusOptions.find(opt => opt.key === data.projectSubStatus);
    const parentStatus = selectedStatus?.parentId 
      ? statusOptions.find(opt => opt.id === selectedStatus.parentId)
      : null;
    
    createProjectMutation.mutate({
      ...data,
      icon: "building",
      status: "active",
      projectStatus: parentStatus?.key || "lead",
    } as InsertProject);
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-create-project">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Add a new project to organize your construction work.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Project Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Sunshine Coast Villa"
                      data-testid="input-project-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Project Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the project..."
                      data-testid="input-project-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Project Status */}
            <FormField
              control={form.control}
              name="projectSubStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-status">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {detailedStatusOptions.map((status) => (
                        <SelectItem key={status.id} value={status.key}>
                          {status.label || status.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Project Color */}
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        className="w-16 h-10 p-1 border rounded"
                        data-testid="input-project-color"
                        {...field}
                      />
                      <Input
                        type="text"
                        placeholder="#3b82f6"
                        className="flex-1"
                        data-testid="input-project-color-hex"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-create-project"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createProjectMutation.isPending}
                data-testid="button-submit-create-project"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}