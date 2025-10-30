import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Copy, Check } from "lucide-react";

const inviteFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  roleId: z.string().min(1, "Role is required"),
  projectIds: z.array(z.string()).default([]),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function InviteUserDialog({
  open,
  onOpenChange,
}: InviteUserDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch available roles
  const { data: roles = [] } = useQuery({
    queryKey: ["/api/user-roles"],
  });

  // Fetch available projects
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Filter to active projects only
  const activeProjects = projects.filter((p: any) => p.isActive && !p.isArchived);

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      roleId: "",
      projectIds: [],
    },
  });

  // Filter roles to only show team member roles
  const teamRoles = roles.filter((role: any) => role.userCategory === "team");

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormValues) => {
      return await apiRequest("/api/invitations", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          userCategory: "team",
          invitedBy: user?.id,
          company: user?.company,
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      const url = `${window.location.origin}/accept-invite/${data.inviteToken}`;
      setInviteUrl(url);
      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${form.getValues("email")}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: InviteFormValues) => {
    inviteMutation.mutate(values);
  };

  const handleCopyLink = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast({
        title: "Link copied",
        description: "The invitation link has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    form.reset();
    setInviteUrl(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to a team member to join your company
          </DialogDescription>
        </DialogHeader>

        {inviteUrl ? (
          // Success state - show invite link
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center py-4">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg mb-2">Invitation Created!</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Copy the link below and send it to the user. They can use it to create their account.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={inviteUrl}
                readOnly
                className="flex-1"
                data-testid="input-invite-url"
              />
              <Button
                onClick={handleCopyLink}
                variant="outline"
                data-testid="button-copy-invite-url"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-close-invite-dialog">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Form state
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John"
                          {...field}
                          data-testid="input-first-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Doe"
                          {...field}
                          data-testid="input-last-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="john.doe@example.com"
                        {...field}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="+61 400 000 000"
                        {...field}
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teamRoles.map((role: any) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      This determines the user's permissions
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectIds"
                render={() => (
                  <FormItem>
                    <div className="mb-4">
                      <FormLabel className="text-base">Project Access</FormLabel>
                      <FormDescription>
                        Select which projects this user can access
                      </FormDescription>
                    </div>
                    {activeProjects.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No active projects available
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-4">
                        {activeProjects.map((project: any) => (
                          <FormField
                            key={project.id}
                            control={form.control}
                            name="projectIds"
                            render={({ field }) => (
                              <FormItem
                                key={project.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(project.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, project.id])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== project.id
                                            )
                                          );
                                    }}
                                    data-testid={`checkbox-project-${project.id}`}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal">
                                  {project.name}
                                  {project.description && (
                                    <span className="text-muted-foreground ml-2">
                                      - {project.description}
                                    </span>
                                  )}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  data-testid="button-cancel-invite"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  data-testid="button-send-invite"
                >
                  {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
