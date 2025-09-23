import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  List
} from "lucide-react";
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
    description: "Custom fields for notes, tasks, and other forms"
  }
];

// Company info form schema
const companyInfoSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  address: z.string().optional(),
  facebook: z.string().optional(),
  linkedin: z.string().optional(), 
  twitter: z.string().optional(),
  instagram: z.string().optional(),
  googleMyBusiness: z.string().optional(),
  yelp: z.string().optional()
});

export default function Settings() {
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
      const response = await apiRequest("PATCH", "/api/company-settings", data);
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
    <div className="flex h-screen bg-background" data-testid="settings-page">
      {/* Left Sidebar */}
      <div className="w-64 border-r bg-card">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Company Settings</h1>
          <nav className="space-y-1">
            {SETTINGS_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = activeSection === category.id;
              
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveSection(category.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors hover-elevate ${
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
            
            {activeSection !== "branding" && activeSection !== "field-settings" && (
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
      const response = await apiRequest("POST", "/api/custom-field-defs", data);
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
      const response = await apiRequest("PATCH", `/api/custom-field-defs/${id}`, data);
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
      const response = await apiRequest("DELETE", `/api/custom-field-defs/${id}`);
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
      const response = await apiRequest("POST", `/api/field-categories/${selectedCategoryId}/options/batch`, optionsData);
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

  if (isLoadingCategories) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading field categories...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold" data-testid="heading-field-settings">Field Settings</h2>
          <p className="text-muted-foreground">
            Manage predefined field categories and their options
          </p>
        </div>
        {isDirty && (
          <div className="flex gap-2">
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

      <div className="flex gap-6 h-[600px]">
        {/* Master Panel - Category List */}
        <Card className="w-80 flex-shrink-0" data-testid="card-categories-master">
          <CardHeader>
            <CardTitle className="text-lg" data-testid="title-field-categories">Field Categories</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select a category to manage its options
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-1">
              {categories.map((category: FieldCategoryWithOptions) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={`w-full text-left p-4 flex items-center gap-3 hover-elevate ${
                    selectedCategoryId === category.id 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted"
                  }`}
                  data-testid={`category-${category.key}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">{category.label}</p>
                    <p className="text-xs opacity-70">
                      {category.options?.length || 0} options
                    </p>
                  </div>
                  <List className="h-4 w-4" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detail Panel - Options Table */}
        <Card className="flex-1" data-testid="card-options-detail">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg" data-testid="title-selected-category">
                  {selectedCategory?.label || "Select Category"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Manage options for this field category
                </p>
              </div>
              <Button 
                onClick={handleAddOption}
                size="sm"
                data-testid="button-add-option"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Option
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {options.length === 0 ? (
              <div className="text-center py-8">
                <List className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No Options</h3>
                <p className="text-muted-foreground mb-4">
                  This category has no options yet.
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
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-12 gap-3 text-xs font-medium text-muted-foreground p-2 border-b">
                  <div className="col-span-1">Color</div>
                  <div className="col-span-4">Name</div>
                  <div className="col-span-3">Key</div>
                  <div className="col-span-1 text-center">Active</div>
                  <div className="col-span-1 text-center">Default</div>
                  <div className="col-span-1 text-center">Order</div>
                  <div className="col-span-1 text-center">Remove</div>
                </div>
                {options.map((option, index) => (
                  <div
                    key={option.id || index}
                    className="grid grid-cols-12 gap-3 items-center p-3 border rounded-lg hover-elevate"
                    data-testid={`option-row-${index}`}
                  >
                    {/* Color Picker */}
                    <div className="col-span-1">
                      <select
                        value={option.color || "#6B7280"}
                        onChange={(e) => handleOptionChange(index, "color", e.target.value)}
                        className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                        style={{ backgroundColor: option.color || "#6B7280" }}
                        data-testid={`color-select-${index}`}
                      >
                        {colorOptions.map((color) => (
                          <option key={color} value={color} style={{ backgroundColor: color }}>
                            
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Name Input */}
                    <div className="col-span-4">
                      <Input
                        value={option.name}
                        onChange={(e) => handleOptionChange(index, "name", e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Option name"
                        data-testid={`name-input-${index}`}
                      />
                    </div>

                    {/* Key Input */}
                    <div className="col-span-3">
                      <Input
                        value={option.key}
                        onChange={(e) => handleOptionChange(index, "key", e.target.value)}
                        className="h-8 text-sm font-mono"
                        placeholder="option_key"
                        data-testid={`key-input-${index}`}
                      />
                    </div>

                    {/* Active Toggle */}
                    <div className="col-span-1 flex justify-center">
                      <Checkbox
                        checked={option.isActive}
                        onCheckedChange={(checked) => handleOptionChange(index, "isActive", checked)}
                        data-testid={`active-checkbox-${index}`}
                      />
                    </div>

                    {/* Default Toggle */}
                    <div className="col-span-1 flex justify-center">
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

                    {/* Sort Order */}
                    <div className="col-span-1">
                      <Input
                        type="number"
                        value={option.sortOrder}
                        onChange={(e) => handleOptionChange(index, "sortOrder", parseInt(e.target.value) || 0)}
                        className="h-8 text-sm w-16"
                        data-testid={`sort-input-${index}`}
                      />
                    </div>

                    {/* Remove Button */}
                    <div className="col-span-1 flex justify-center">
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}