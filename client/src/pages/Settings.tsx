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
import type { CompanySettings, CustomFieldDef, InsertCustomFieldDef } from "@shared/schema";

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
            {activeSection === "field-settings" && <FieldSettingsSection />}
            
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

  // Fetch custom field definitions
  const { data: customFields = [], isLoading: isLoadingFields } = useQuery<CustomFieldDef[]>({
    queryKey: ["/api/custom-field-defs"],
  });

  // Filter fields by section
  const notesFields = customFields; // For now, all custom fields apply to notes and tasks
  const tasksFields = customFields; 

  const fieldSections = [
    {
      id: "notes",
      label: "Notes",
      icon: StickyNote,
      description: "Custom fields for notes and templates",
      fields: notesFields
    },
    {
      id: "tasks", 
      label: "Tasks",
      icon: CheckSquare,
      description: "Custom fields for tasks and project items",
      fields: tasksFields
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
                      {section.label} Custom Fields
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {section.description}
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
                            data-testid={`button-edit-field-${field.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid={`button-delete-field-${field.id}`}
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

      {/* Add/Edit Field Modal would go here */}
      {isAddingField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Custom Field</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Custom field creation form will be implemented in the next phase.
              </p>
              <Button onClick={() => setIsAddingField(false)} className="w-full">
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}