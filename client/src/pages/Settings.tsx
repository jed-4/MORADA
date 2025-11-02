import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Building2,
  Settings as SettingsIcon,
  Users,
  Briefcase,
  Plug,
  Globe,
  FileText,
  Shield,
  Calendar,
  Database,
  Mail,
  Layout,
  User,
  Phone,
  MapPin,
  Upload,
  Save,
  X,
  Sliders,
  Plus,
  Edit,
  Trash2,
  StickyNote,
  CheckSquare,
  Type,
  List,
  GripVertical,
  Bell
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  CSS,
} from '@dnd-kit/utilities';
import { z } from "zod";
import type { CompanySettings, CustomFieldDef, InsertCustomFieldDef, FieldCategoryWithOptions, FieldOption } from "@shared/schema";
import { insertCustomFieldDefSchema } from "@shared/schema";

// Company Settings categories matching Buildern structure
const SETTINGS_CATEGORIES = [
  {
    id: "branding",
    label: "Branding",
    icon: Building2,
    description: "Company information, logo, and branding"
  },
  {
    id: "system-configuration", 
    label: "System configuration",
    icon: SettingsIcon,
    description: "Date formats, language, and system preferences"
  },
  {
    id: "roles-permissions",
    label: "Roles & Permissions", 
    icon: Shield,
    description: "User roles and permission management"
  },
  {
    id: "license-insurance",
    label: "License and Insurance",
    icon: FileText,
    description: "Upload and manage business documents"
  },
  {
    id: "terms-conditions",
    label: "Terms and Conditions",
    icon: FileText,
    description: "Contract templates and legal documents"
  },
  {
    id: "accounting-integration",
    label: "Accounting integration",
    icon: Plug,
    description: "Connect with Xero and other accounting software"
  },
  {
    id: "schedule-settings",
    label: "Schedule settings",
    icon: Calendar,
    description: "Working hours, holidays, and calendar configuration"
  },
  {
    id: "default-values",
    label: "Default values",
    icon: Database,
    description: "Units, project types, statuses, and system defaults"
  },
  {
    id: "email-messages",
    label: "Email messages",
    icon: Mail,
    description: "Customize email templates and messaging"
  },
  {
    id: "layout-templates",
    label: "Layout Template",
    icon: Layout,
    description: "Proposal and document layout templates"
  },
  {
    id: "field-settings",
    label: "Field Settings",
    icon: Sliders,
    description: "Manage project statuses and custom field options"
  },
  {
    id: "task-settings",
    label: "Task Management",
    icon: CheckSquare,
    description: "Manage task tags and template statuses"
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    description: "Control what notifications you receive"
  }
];

// Company info form schema
const companyInfoSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  address: z.string().optional(),
  taxRate: z.coerce.number().min(0).max(100).default(10),
  standardWorkStart: z.string().optional(),
  standardWorkEnd: z.string().optional(),
  facebook: z.string().optional(),
  linkedin: z.string().optional(), 
  twitter: z.string().optional(),
  instagram: z.string().optional(),
  googleMyBusiness: z.string().optional(),
  yelp: z.string().optional()
});

export default function Settings() {
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState("branding");
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  // Company info form
  const companyForm = useForm<z.infer<typeof companyInfoSchema>>({
    resolver: zodResolver(companyInfoSchema),
    defaultValues: {
      companyName: "",
      email: "",
      phone: "",
      website: "",
      address: "",
      taxRate: 10,
      standardWorkStart: "07:00",
      standardWorkEnd: "15:30",
      facebook: "",
      linkedin: "",
      twitter: "",
      instagram: "",
      googleMyBusiness: "",
      yelp: ""
    },
  });

  // Fetch company settings data
  const { data: companySettings, isLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Update form when company settings data is loaded
  useEffect(() => {
    if (companySettings) {
      companyForm.reset({
        companyName: companySettings.companyName || "",
        email: companySettings.email || "",
        phone: companySettings.phone || "",
        website: companySettings.website || "",
        address: companySettings.address || "",
        taxRate: companySettings.taxRate ? parseFloat(companySettings.taxRate as string) : 10,
        standardWorkStart: companySettings.standardWorkStart || "07:00",
        standardWorkEnd: companySettings.standardWorkEnd || "15:30",
        facebook: companySettings.facebook || "",
        linkedin: companySettings.linkedin || "",
        twitter: companySettings.twitter || "",
        instagram: companySettings.instagram || "",
        googleMyBusiness: companySettings.googleMyBusiness || "",
        yelp: companySettings.yelp || "",
      });
    }
  }, [companySettings, companyForm]);

  // Company info mutation 
  const updateCompanyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof companyInfoSchema>) => {
      const response = await apiRequest("/api/company-settings", "PATCH", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "Company settings updated successfully" });
      setIsEditing(false);
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update company settings", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSubmitCompanyInfo = (data: z.infer<typeof companyInfoSchema>) => {
    updateCompanyMutation.mutate(data);
  };

  const handleEditCompanyInfo = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    companyForm.reset();
  };

  const activeCategory = SETTINGS_CATEGORIES.find(cat => cat.id === activeSection);

  // Notifications Section Component
  const NotificationsSection = () => {
    const [notifications, setNotifications] = useState(() => {
      const saved = localStorage.getItem('notificationPreferences');
      return saved ? JSON.parse(saved) : {
        // Project notifications
        projectCreated: true,
        projectUpdated: true,
        projectCompleted: true,
        
        // Task notifications
        taskAssigned: true,
        taskDueDate: true,
        taskCompleted: true,
        taskComments: true,
        
        // Team notifications
        teamMemberAdded: true,
        teamMemberRemoved: false,
        
        // Site Diary notifications
        siteDiaryCreated: true,
        siteDiaryUpdated: false,
        
        // Estimate & Invoice notifications
        estimateCreated: true,
        estimateApproved: true,
        invoiceCreated: true,
        invoicePaid: true,
        
        // Email notifications
        emailNotifications: true,
        emailDigest: false,
      };
    });

    const handleToggle = (key: string) => {
      const updated = { ...notifications, [key]: !notifications[key] };
      setNotifications(updated);
      localStorage.setItem('notificationPreferences', JSON.stringify(updated));
      toast({ title: "Notification preferences updated" });
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Notification Preferences</h2>
          <p className="text-muted-foreground">
            Choose what notifications you want to receive
          </p>
        </div>

        {/* Project Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Project Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Project Created</Label>
                <p className="text-sm text-muted-foreground">Get notified when a new project is created</p>
              </div>
              <Checkbox
                checked={notifications.projectCreated}
                onCheckedChange={() => handleToggle('projectCreated')}
                data-testid="notification-project-created"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Project Updated</Label>
                <p className="text-sm text-muted-foreground">Get notified when a project is updated</p>
              </div>
              <Checkbox
                checked={notifications.projectUpdated}
                onCheckedChange={() => handleToggle('projectUpdated')}
                data-testid="notification-project-updated"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Project Completed</Label>
                <p className="text-sm text-muted-foreground">Get notified when a project is completed</p>
              </div>
              <Checkbox
                checked={notifications.projectCompleted}
                onCheckedChange={() => handleToggle('projectCompleted')}
                data-testid="notification-project-completed"
              />
            </div>
          </CardContent>
        </Card>

        {/* Task Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Task Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Task Assigned</Label>
                <p className="text-sm text-muted-foreground">Get notified when you're assigned to a task</p>
              </div>
              <Checkbox
                checked={notifications.taskAssigned}
                onCheckedChange={() => handleToggle('taskAssigned')}
                data-testid="notification-task-assigned"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Task Due Date</Label>
                <p className="text-sm text-muted-foreground">Get notified when a task is due soon</p>
              </div>
              <Checkbox
                checked={notifications.taskDueDate}
                onCheckedChange={() => handleToggle('taskDueDate')}
                data-testid="notification-task-due"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Task Completed</Label>
                <p className="text-sm text-muted-foreground">Get notified when a task is completed</p>
              </div>
              <Checkbox
                checked={notifications.taskCompleted}
                onCheckedChange={() => handleToggle('taskCompleted')}
                data-testid="notification-task-completed"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Task Comments</Label>
                <p className="text-sm text-muted-foreground">Get notified when someone comments on your tasks</p>
              </div>
              <Checkbox
                checked={notifications.taskComments}
                onCheckedChange={() => handleToggle('taskComments')}
                data-testid="notification-task-comments"
              />
            </div>
          </CardContent>
        </Card>

        {/* Team Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Team Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Team Member Added</Label>
                <p className="text-sm text-muted-foreground">Get notified when someone joins your team</p>
              </div>
              <Checkbox
                checked={notifications.teamMemberAdded}
                onCheckedChange={() => handleToggle('teamMemberAdded')}
                data-testid="notification-team-added"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Team Member Removed</Label>
                <p className="text-sm text-muted-foreground">Get notified when someone leaves your team</p>
              </div>
              <Checkbox
                checked={notifications.teamMemberRemoved}
                onCheckedChange={() => handleToggle('teamMemberRemoved')}
                data-testid="notification-team-removed"
              />
            </div>
          </CardContent>
        </Card>

        {/* Site Diary Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Site Diary Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Site Diary Created</Label>
                <p className="text-sm text-muted-foreground">Get notified when a new site diary entry is created</p>
              </div>
              <Checkbox
                checked={notifications.siteDiaryCreated}
                onCheckedChange={() => handleToggle('siteDiaryCreated')}
                data-testid="notification-diary-created"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Site Diary Updated</Label>
                <p className="text-sm text-muted-foreground">Get notified when a site diary entry is updated</p>
              </div>
              <Checkbox
                checked={notifications.siteDiaryUpdated}
                onCheckedChange={() => handleToggle('siteDiaryUpdated')}
                data-testid="notification-diary-updated"
              />
            </div>
          </CardContent>
        </Card>

        {/* Financial Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Estimate Created</Label>
                <p className="text-sm text-muted-foreground">Get notified when a new estimate is created</p>
              </div>
              <Checkbox
                checked={notifications.estimateCreated}
                onCheckedChange={() => handleToggle('estimateCreated')}
                data-testid="notification-estimate-created"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Estimate Approved</Label>
                <p className="text-sm text-muted-foreground">Get notified when an estimate is approved</p>
              </div>
              <Checkbox
                checked={notifications.estimateApproved}
                onCheckedChange={() => handleToggle('estimateApproved')}
                data-testid="notification-estimate-approved"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Invoice Created</Label>
                <p className="text-sm text-muted-foreground">Get notified when a new invoice is created</p>
              </div>
              <Checkbox
                checked={notifications.invoiceCreated}
                onCheckedChange={() => handleToggle('invoiceCreated')}
                data-testid="notification-invoice-created"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Invoice Paid</Label>
                <p className="text-sm text-muted-foreground">Get notified when an invoice is paid</p>
              </div>
              <Checkbox
                checked={notifications.invoicePaid}
                onCheckedChange={() => handleToggle('invoicePaid')}
                data-testid="notification-invoice-paid"
              />
            </div>
          </CardContent>
        </Card>

        {/* Email Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Email Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive notifications via email</p>
              </div>
              <Checkbox
                checked={notifications.emailNotifications}
                onCheckedChange={() => handleToggle('emailNotifications')}
                data-testid="notification-email"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Daily Digest</Label>
                <p className="text-sm text-muted-foreground">Receive a daily summary of all notifications</p>
              </div>
              <Checkbox
                checked={notifications.emailDigest}
                onCheckedChange={() => handleToggle('emailDigest')}
                data-testid="notification-digest"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Company Info Section Component
  const CompanyInfoSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Company information</h2>
          <p className="text-muted-foreground">
            Manage your business details and branding
          </p>
        </div>
        {!isEditing ? (
          <Button onClick={handleEditCompanyInfo} data-testid="edit-company-info">
            Edit Company Info
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancelEdit}>
              <X className="h-4 w-4 mr-2" />
              Discard Changes
            </Button>
            <Button 
              onClick={companyForm.handleSubmit(onSubmitCompanyInfo)}
              disabled={updateCompanyMutation.isPending}
              data-testid="save-company-info"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateCompanyMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      <Form {...companyForm}>
        <form className="space-y-6">
          {/* Company Information */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={companyForm.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Lighthouse Projects"
                          {...field}
                          disabled={!isEditing}
                          data-testid="company-name-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="jed@lighthouseprojects.com.au"
                          {...field}
                          disabled={!isEditing}
                          data-testid="company-email-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0439345723"
                          {...field}
                          disabled={!isEditing}
                          data-testid="company-phone-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Website</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://lighthouseprojects.com.au/"
                          {...field}
                          disabled={!isEditing}
                          data-testid="company-website-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={companyForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your company address"
                        {...field}
                        disabled={!isEditing}
                        data-testid="company-address-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={companyForm.control}
                name="taxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="10"
                        {...field}
                        disabled={!isEditing}
                        data-testid="tax-rate-input"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={companyForm.control}
                  name="standardWorkStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standard Work Start Time</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          placeholder="07:00"
                          {...field}
                          disabled={!isEditing}
                          data-testid="standard-work-start-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="standardWorkEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standard Work End Time</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          placeholder="15:30"
                          {...field}
                          disabled={!isEditing}
                          data-testid="standard-work-end-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Company Logo */}
          <Card>
            <CardHeader>
              <CardTitle>Company logo</CardTitle>
              <p className="text-sm text-muted-foreground">
                The logo will be shown in Web views, Client portal and Emails. Max file size: 100 MB, preferred square shape. 
                Allowed formats: .jpg, .jpeg, .png, .gif, .webp, .svg, .avif, .bmp, .heic, .tiff
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded border-2 border-dashed flex items-center justify-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">
                    Drag and drop to upload files
                  </p>
                  {isEditing && (
                    <Button variant="outline" size="sm" className="mt-2" disabled>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Social Media */}
          <Card>
            <CardHeader>
              <CardTitle>Social media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={companyForm.control}
                  name="facebook"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Facebook</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Facebook profile URL"
                          {...field}
                          disabled={!isEditing}
                          data-testid="facebook-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="linkedin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="LinkedIn profile URL"
                          {...field}
                          disabled={!isEditing}
                          data-testid="linkedin-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="twitter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twitter</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Twitter profile URL"
                          {...field}
                          disabled={!isEditing}
                          data-testid="twitter-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="instagram"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instagram</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Instagram profile URL"
                          {...field}
                          disabled={!isEditing}
                          data-testid="instagram-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="googleMyBusiness"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google my business</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Google My Business URL"
                          {...field}
                          disabled={!isEditing}
                          data-testid="google-business-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={companyForm.control}
                  name="yelp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yelp</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Yelp business URL"
                          {...field}
                          disabled={!isEditing}
                          data-testid="yelp-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );

  return (
    <div className="flex h-screen bg-background page-transition" data-testid="settings-page">
      {/* Left Sidebar */}
      <div className="w-64 border-r bg-card">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight mb-6">Company Settings</h1>
          <nav className="space-y-1">
            {SETTINGS_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = activeSection === category.id;
              
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    if (category.id === "system-configuration") {
                      navigate("/system-configuration");
                    } else if (category.id === "roles-permissions") {
                      navigate("/roles-permissions");
                    } else if (category.id === "field-settings") {
                      navigate("/field-settings");
                    } else if (category.id === "task-settings") {
                      navigate("/task-settings");
                    } else {
                      setActiveSection(category.id);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left btn-enhanced focus-enhanced ${
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid={`settings-nav-${category.id}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{category.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            {/* Section Header */}
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                {activeCategory && <activeCategory.icon className="h-6 w-6" />}
                <h1 className="text-3xl font-bold capitalize">
                  {activeCategory?.label || "Settings"}
                </h1>
              </div>
              <p className="text-muted-foreground">
                {activeCategory?.description || "Manage your company settings"}
              </p>
            </div>

            {/* Content based on active section */}
            {activeSection === "branding" && <CompanyInfoSection />}
            {activeSection === "field-settings" && <FieldCategoriesSection />}
            {activeSection === "notifications" && <NotificationsSection />}
            
            {activeSection !== "branding" && activeSection !== "field-settings" && activeSection !== "notifications" && (
              <div className="text-center py-12">
                <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  {activeCategory && <activeCategory.icon className="h-8 w-8 text-muted-foreground" />}
                </div>
                <h3 className="text-lg font-medium mb-2">
                  {activeCategory?.label} - Coming Soon
                </h3>
                <p className="text-muted-foreground">
                  This settings section is under development and will be available soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Field Settings Section Component  
function FieldSettingsSection() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("notes");
  const [isAddingField, setIsAddingField] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [deletingField, setDeletingField] = useState<CustomFieldDef | null>(null);

  // Fetch custom field definitions
  const { data: customFields = [], isLoading: isLoadingFields } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/custom-field-defs"],
  });

  // Form for adding/editing fields
  const fieldForm = useForm<InsertCustomFieldDef>({
    resolver: zodResolver(insertCustomFieldDefSchema),
    defaultValues: {
      key: "",
      label: "",
      type: "text",
      required: false,
      order: 0,
      isActive: true
    }
  });

  // Create custom field mutation
  const createFieldMutation = useMutation({
    mutationFn: async (data: InsertCustomFieldDef) => {
      const response = await apiRequest("/api/custom-field-defs", "POST", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-defs"] });
      toast({ title: "Custom field created successfully" });
      setIsAddingField(false);
      fieldForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error creating field", 
        description: error.message || "Failed to create custom field",
        variant: "destructive" 
      });
    }
  });

  // Update custom field mutation
  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCustomFieldDef> }) => {
      const response = await apiRequest(`/api/custom-field-defs/${id}`, "PATCH", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-defs"] });
      toast({ title: "Custom field updated successfully" });
      setEditingField(null);
      fieldForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating field", 
        description: error.message || "Failed to update custom field",
        variant: "destructive" 
      });
    }
  });

  // Delete custom field mutation
  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/custom-field-defs/${id}`, "DELETE");
      return response.ok;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-field-defs"] });
      toast({ title: "Custom field deleted successfully" });
      setDeletingField(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error deleting field", 
        description: error.message || "Failed to delete custom field",
        variant: "destructive" 
      });
    }
  });

  // Form submission handlers
  const handleAddField = (data: InsertCustomFieldDef) => {
    createFieldMutation.mutate(data);
  };

  const handleEditField = (data: InsertCustomFieldDef) => {
    if (editingField) {
      updateFieldMutation.mutate({ id: editingField.id, data });
    }
  };

  const handleDeleteField = () => {
    if (deletingField) {
      deleteFieldMutation.mutate(deletingField.id);
    }
  };

  // Reset form when editing changes
  useEffect(() => {
    if (editingField) {
      fieldForm.reset({
        key: editingField.key,
        label: editingField.label,
        type: editingField.type as "text" | "select",
        required: editingField.required,
        order: editingField.order
      });
    } else {
      fieldForm.reset({
        key: "",
        label: "",
        type: "text",
        required: false,
        order: 0
      });
    }
  }, [editingField, fieldForm]);

  // Filter fields by section
  const notesFields = customFields; // For now, all custom fields apply to notes and tasks
  const tasksFields = customFields; 

  const fieldSections = [
    {
      id: "notes",
      label: "Notes",
      icon: StickyNote,
      description: "View how custom fields appear in notes and templates",
      fields: customFields
    },
    {
      id: "tasks", 
      label: "Tasks",
      icon: CheckSquare,
      description: "View how custom fields appear in tasks and project items", 
      fields: customFields
    }
  ];

  if (isLoadingFields) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-muted-foreground">Loading custom fields...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Field Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          {fieldSections.map((section) => (
            <TabsTrigger key={section.id} value={section.id} data-testid={`tab-${section.id}`}>
              <section.icon className="h-4 w-4 mr-2" />
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {fieldSections.map((section) => (
          <TabsContent key={section.id} value={section.id}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <section.icon className="h-5 w-5" />
                      {section.label} - Custom Fields
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {section.description}
                    </p>
                    <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-2">
                      Note: Custom fields are shared across all notes and tasks
                    </p>
                  </div>
                  <Button
                    onClick={() => setIsAddingField(true)}
                    size="sm"
                    data-testid={`button-add-field-${section.id}`}
                    disabled={section.fields.length >= 4}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Field
                  </Button>
                </div>
                {section.fields.length >= 4 && (
                  <Badge variant="outline" className="w-fit">
                    Maximum 4 custom fields allowed
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {section.fields.length === 0 ? (
                  <div className="text-center py-8">
                    <section.icon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No custom fields</h3>
                    <p className="text-muted-foreground mb-4">
                      Add custom fields to capture additional information for your {section.label.toLowerCase()}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {section.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                        data-testid={`field-item-${field.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {field.type === 'text' ? (
                              <Type className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <List className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="font-medium">{field.label}</div>
                              <div className="text-sm text-muted-foreground">
                                {field.type === 'text' ? 'Text field' : 'Select dropdown'}
                                {field.required && ' • Required'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingField(field)}
                            data-testid={index === 0 ? "button-edit-field" : `button-edit-field-${field.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingField(field)}
                            data-testid={index === 0 ? "button-delete-field" : `button-delete-field-${field.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Add Field Modal */}
      {isAddingField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="modal-add-field">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Custom Field</CardTitle>
              <p className="text-sm text-muted-foreground">
                Create a new custom field for notes and tasks
              </p>
            </CardHeader>
            <CardContent>
              <Form {...fieldForm}>
                <form onSubmit={fieldForm.handleSubmit(handleAddField)} className="space-y-4">
                  <FormField
                    control={fieldForm.control}
                    name="key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Key</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="field_name"
                            data-testid="input-field-key"
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          Used internally (lowercase, underscores only)
                        </p>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={fieldForm.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Label</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Field Name"
                            data-testid="input-field-label"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={fieldForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-field-type">
                              <SelectValue placeholder="Select field type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="text">Text Input</SelectItem>
                            <SelectItem value="select">Dropdown Select</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={fieldForm.control}
                    name="required"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-field-required"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Required field</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            Users must fill this field
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddingField(false)}
                      data-testid="button-cancel-add-field"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createFieldMutation.isPending}
                      data-testid="button-save-add-field"
                    >
                      {createFieldMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      ) : null}
                      Add Field
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Field Modal */}
      {editingField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="modal-edit-field">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Edit Custom Field</CardTitle>
              <p className="text-sm text-muted-foreground">
                Update the custom field details
              </p>
            </CardHeader>
            <CardContent>
              <Form {...fieldForm}>
                <form onSubmit={fieldForm.handleSubmit(handleEditField)} className="space-y-4">
                  <FormField
                    control={fieldForm.control}
                    name="key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Key</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            disabled
                            data-testid="input-edit-field-key"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Field key cannot be changed after creation
                        </p>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={fieldForm.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Label</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Field Name"
                            data-testid="input-edit-field-label"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={fieldForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-field-type">
                              <SelectValue placeholder="Select field type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="text">Text Input</SelectItem>
                            <SelectItem value="select">Dropdown Select</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={fieldForm.control}
                    name="required"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-edit-field-required"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Required field</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            Users must fill this field
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingField(null)}
                      data-testid="button-cancel-edit-field"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateFieldMutation.isPending}
                      data-testid="button-save-edit-field"
                    >
                      {updateFieldMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      ) : null}
                      Update Field
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="modal-delete-field">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Delete Custom Field
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                This action cannot be undone. This will permanently delete the custom field.
              </p>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-3 rounded-lg mb-4">
                <div className="font-medium">{deletingField.label}</div>
                <div className="text-sm text-muted-foreground">
                  {deletingField.type === 'text' ? 'Text field' : 'Select dropdown'}
                  {deletingField.required && ' • Required'}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeletingField(null)}
                  data-testid="button-cancel-delete-field"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteField}
                  disabled={deleteFieldMutation.isPending}
                  data-testid="button-confirm-delete-field"
                >
                  {deleteFieldMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : null}
                  Delete Field
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Sortable Item Component for Drag and Drop
interface SortableItemProps {
  id: string;
  option: {
    id?: string;
    key: string;
    name: string;
    color: string | null;
    isActive: boolean;
    isDefault: boolean;
    isCompleted: boolean;
    sortOrder: number;
    categoryId: string;
  };
  index: number;
  handleOptionChange: (index: number, field: string, value: any) => void;
  handleRemoveOption: (index: number) => void;
  colorOptions: string[];
  options: any[];
  setOptions: (options: any[]) => void;
  setIsDirty: (dirty: boolean) => void;
}

function SortableItem({ 
  id, 
  option, 
  index, 
  handleOptionChange, 
  handleRemoveOption, 
  colorOptions,
  options,
  setOptions,
  setIsDirty
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-4 border rounded-lg hover-elevate bg-card"
      data-testid={`option-row-${index}`}
    >
      {/* Drag Handle */}
      <div className="flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-grab active:cursor-grabbing h-8 w-8"
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-${index}`}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Color Picker */}
      <div className="flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-10 h-10 rounded-md border-2 p-0 shadow-sm"
              style={{ backgroundColor: option.color || "#6B7280" }}
              data-testid={`color-select-${index}`}
            >
              <span className="sr-only">Select color</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 p-3" align="start">
            <div className="grid grid-cols-6 gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleOptionChange(index, "color", color)}
                  className="w-8 h-8 rounded-md border-2 hover:scale-110 transition-transform shadow-sm"
                  style={{ backgroundColor: color }}
                  title={color}
                  data-testid={`color-option-${color.replace('#', '')}`}
                >
                  <span className="sr-only">{color}</span>
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Name Input */}
      <div className="flex-1 min-w-[180px]">
        <Input
          value={option.name}
          onChange={(e) => handleOptionChange(index, "name", e.target.value)}
          className="h-9"
          placeholder="Option name"
          data-testid={`name-input-${index}`}
        />
      </div>

      {/* Key Input */}
      <div className="flex-1 min-w-[180px]">
        <Input
          value={option.key}
          onChange={(e) => handleOptionChange(index, "key", e.target.value)}
          className="h-9 font-mono text-sm"
          placeholder="option_key"
          data-testid={`key-input-${index}`}
        />
      </div>

      {/* Active Toggle */}
      <div className="flex-shrink-0 flex items-center justify-center w-16">
        <Checkbox
          checked={option.isActive}
          onCheckedChange={(checked) => handleOptionChange(index, "isActive", checked)}
          data-testid={`active-checkbox-${index}`}
        />
      </div>

      {/* Default Toggle */}
      <div className="flex-shrink-0 flex items-center justify-center w-16">
        <Checkbox
          checked={option.isDefault}
          onCheckedChange={(checked) => {
            // Only allow one default option per category
            const updated = options.map((opt, i) => ({
              ...opt,
              isDefault: i === index ? (checked as boolean) : false
            }));
            setOptions(updated);
            setIsDirty(true);
          }}
          data-testid={`default-checkbox-${index}`}
        />
      </div>

      {/* Completed Toggle */}
      <div className="flex-shrink-0 flex items-center justify-center w-16">
        <Checkbox
          checked={option.isCompleted}
          onCheckedChange={(checked) => {
            // Only allow one completed option per category
            const updated = options.map((opt, i) => ({
              ...opt,
              isCompleted: i === index ? (checked as boolean) : false
            }));
            setOptions(updated);
            setIsDirty(true);
          }}
          data-testid={`completed-checkbox-${index}`}
        />
      </div>

      {/* Remove Button */}
      <div className="flex-shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleRemoveOption(index)}
          className="h-6 w-6 p-0"
          data-testid={`remove-button-${index}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Field Categories Section Component (Buildern-style master-detail interface)
function FieldCategoriesSection() {
  const { toast } = useToast();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);
  interface LocalOption {
    id?: string;
    key: string;
    name: string;
    color: string | null;
    isActive: boolean;
    isDefault: boolean;
    isCompleted: boolean;
    sortOrder: number;
    categoryId: string;
    createdAt?: Date;
    updatedAt?: Date;
  }
  
  const [options, setOptions] = useState<LocalOption[]>([]);
  
  // Fetch field categories
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Auto-select first category if none selected
  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  // Fetch options for selected category
  const selectedCategory = categories.find((cat: FieldCategoryWithOptions) => cat.id === selectedCategoryId);

  useEffect(() => {
    if (selectedCategory?.options) {
      setOptions(selectedCategory.options.map((opt: FieldOption) => ({
        id: opt.id,
        key: opt.key,
        name: opt.name,
        color: opt.color || "#6B7280",
        isActive: opt.isActive ?? true,
        isDefault: opt.isDefault ?? false,
        isCompleted: opt.isCompleted ?? false,
        sortOrder: opt.sortOrder ?? 0,
        categoryId: opt.categoryId
      })));
      setIsDirty(false);
    }
  }, [selectedCategory]);

  // Batch update options mutation
  const updateOptionsMutation = useMutation({
    mutationFn: async (optionsData: any[]) => {
      if (!selectedCategoryId) throw new Error("No category selected");
      const response = await apiRequest(`/api/field-categories/${selectedCategoryId}/options/batch`, "POST", optionsData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/field-categories"] });
      toast({ title: "Field options updated successfully" });
      setIsDirty(false);
    },
    onError: (error: any) => {
      // Handle 401 authentication errors specifically
      if (error.message?.includes('401') || error.message?.includes('Authentication required')) {
        toast({ 
          title: "Authentication required", 
          description: "Please log in with admin privileges to save field options",
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Error updating options", 
          description: error.message || "Failed to update field options",
          variant: "destructive" 
        });
      }
    }
  });

  const handleSaveChanges = () => {
    updateOptionsMutation.mutate(options);
  };

  const handleDiscardChanges = () => {
    if (selectedCategory?.options) {
      setOptions(selectedCategory.options.map((opt: FieldOption) => ({
        id: opt.id,
        key: opt.key,
        name: opt.name,
        color: opt.color || "#6B7280",
        isActive: opt.isActive ?? true,
        isDefault: opt.isDefault ?? false,
        isCompleted: opt.isCompleted ?? false,
        sortOrder: opt.sortOrder ?? 0,
        categoryId: opt.categoryId
      })));
      setIsDirty(false);
    }
  };

  const handleOptionChange = (index: number, field: string, value: any) => {
    const updated = [...options];
    updated[index] = { ...updated[index], [field]: value };
    setOptions(updated);
    setIsDirty(true);
  };

  const handleAddOption = () => {
    if (!selectedCategoryId) return;
    
    const newOption: LocalOption = {
      key: `new_option_${Date.now()}`,
      name: "New Option",
      color: "#6B7280",
      isActive: true,
      isDefault: false,
      isCompleted: false,
      sortOrder: options.length,
      categoryId: selectedCategoryId
    };
    setOptions([...options, newOption]);
    setIsDirty(true);
  };

  const handleRemoveOption = (index: number) => {
    const updated = options.filter((_, i) => i !== index);
    setOptions(updated);
    setIsDirty(true);
  };

  const colorOptions = [
    "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
    "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
    "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#6B7280"
  ];

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end event
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = options.findIndex((option) => option.id === active.id || `option-${options.indexOf(option)}` === active.id);
      const newIndex = options.findIndex((option) => option.id === over?.id || `option-${options.indexOf(option)}` === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOptions = arrayMove(options, oldIndex, newIndex);
        // Update sortOrder values based on new positions
        const updatedOptions = newOptions.map((option, index) => ({
          ...option,
          sortOrder: index
        }));
        setOptions(updatedOptions);
        setIsDirty(true);
      }
    }
  };

  if (isLoadingCategories) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading field categories...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between pb-4 mb-6 border-b flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1" data-testid="heading-field-settings">Field Settings</h2>
          <p className="text-base text-muted-foreground">
            Manage predefined field categories and their options
          </p>
        </div>
        {isDirty && (
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={handleDiscardChanges}
              data-testid="button-discard-changes"
            >
              <X className="h-4 w-4 mr-2" />
              Discard Changes
            </Button>
            <Button 
              onClick={handleSaveChanges}
              disabled={updateOptionsMutation.isPending}
              data-testid="button-save-changes"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateOptionsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-8 flex-1 overflow-hidden min-h-0">
        {/* Master Panel - Category List */}
        <Card className="w-96 flex-shrink-0 shadow-sm flex flex-col" data-testid="card-categories-master">
          <CardHeader className="pb-4 flex-shrink-0">
            <CardTitle className="text-lg" data-testid="title-field-categories">Field Categories</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select a category to manage its options
            </p>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            <div className="space-y-1 px-3 pb-3 overflow-y-auto h-full">
              {categories.map((category: FieldCategoryWithOptions) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${
                    selectedCategoryId === category.id 
                      ? "bg-primary text-primary-foreground shadow-md" 
                      : "hover-elevate"
                  }`}
                  data-testid={`category-${category.key}`}
                >
                  <div className="flex-1">
                    <p className="font-semibold">{category.label}</p>
                    <p className={`text-xs mt-0.5 ${selectedCategoryId === category.id ? 'opacity-90' : 'text-muted-foreground'}`}>
                      {category.options?.length || 0} option{category.options?.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <List className="h-5 w-5 opacity-70" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detail Panel - Options Table */}
        <Card className="flex-1 shadow-sm flex flex-col" data-testid="card-options-detail">
          <CardHeader className="pb-5 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold" data-testid="title-selected-category">
                  {selectedCategory?.label || "Select a Category"}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage options for this field category
                </p>
              </div>
              <Button 
                onClick={handleAddOption}
                data-testid="button-add-option"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-2 flex-1 overflow-hidden">
            {options.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <List className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Options Yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  This category has no options yet. Add your first option to get started.
                </p>
                <Button 
                  onClick={handleAddOption}
                  data-testid="button-add-first-option"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Option
                </Button>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b bg-card flex-shrink-0">
                  <div className="flex-shrink-0 w-8"></div>
                  <div className="flex-shrink-0 w-10">Color</div>
                  <div className="flex-1 min-w-[180px]">Name</div>
                  <div className="flex-1 min-w-[180px]">Key</div>
                  <div className="flex-shrink-0 w-16 text-center">Active</div>
                  <div className="flex-shrink-0 w-16 text-center">Default</div>
                  <div className="flex-shrink-0 w-16 text-center">Done</div>
                  <div className="flex-shrink-0 w-9"></div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
                  <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={options.map((option, index) => option.id || `option-${index}`)} 
                      strategy={verticalListSortingStrategy}
                    >
                      {options.map((option, index) => (
                        <SortableItem
                          key={option.id || `option-${index}`}
                          id={option.id || `option-${index}`}
                          option={option}
                          index={index}
                          handleOptionChange={handleOptionChange}
                          handleRemoveOption={handleRemoveOption}
                          colorOptions={colorOptions}
                          options={options}
                          setOptions={setOptions}
                          setIsDirty={setIsDirty}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}