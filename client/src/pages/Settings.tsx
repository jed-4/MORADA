import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
  Bell,
  HardDrive,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Receipt,
  FileCheck,
  ClipboardList,
  Folder,
  MoreHorizontal
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

// Company Settings categories - organized to match sidebar and BuildPro workflow
const SETTINGS_CATEGORIES = [
  // General section
  {
    id: "branding",
    label: "General",
    icon: Building2,
    description: "Company information, logo, and branding",
    group: "general"
  },
  {
    id: "system-configuration", 
    label: "System Configuration",
    icon: SettingsIcon,
    description: "Date formats, language, and system preferences",
    group: "general",
    navigateTo: "/system-configuration"
  },
  {
    id: "roles-permissions",
    label: "Roles & Permissions", 
    icon: Shield,
    description: "User roles and permission management",
    group: "general",
    navigateTo: "/roles-permissions"
  },
  // Field Settings section - matches sidebar order
  {
    id: "field-settings",
    label: "Field Settings",
    icon: Sliders,
    description: "Manage project statuses, task options, and custom fields",
    group: "fields",
    navigateTo: "/field-settings"
  },
  // Schedule section
  {
    id: "schedule-settings",
    label: "Schedule Settings",
    icon: Calendar,
    description: "Working days, hours, holidays, and calendar defaults",
    group: "schedule"
  },
  // Default Values section
  {
    id: "default-values",
    label: "Default Values",
    icon: Database,
    description: "Markup percentages, payment terms, tax rates, and units",
    group: "defaults"
  },
  // Templates section
  {
    id: "terms-conditions",
    label: "Terms & Conditions",
    icon: FileText,
    description: "Contract templates for invoices, quotes, and documents",
    group: "templates"
  },
  {
    id: "layout-templates",
    label: "Layout Templates",
    icon: Layout,
    description: "PDF and email templates for proposals and reports",
    group: "templates"
  },
  {
    id: "email-messages",
    label: "Email Templates",
    icon: Mail,
    description: "Customize email templates and messaging",
    group: "templates"
  },
  // Integrations section
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    description: "Connect Google Drive, Xero, and other services",
    group: "integrations"
  },
  // Documents section
  {
    id: "license-insurance",
    label: "License & Insurance",
    icon: FileText,
    description: "Upload and manage business documents",
    group: "documents"
  },
  // Activity section
  {
    id: "activity",
    label: "Activity Feed",
    icon: Bell,
    description: "Control which items appear in the activity feed",
    group: "activity"
  }
];

// Company info form schema
const companyInfoSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  nickname: z.string().optional(),
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
  const { user } = useAuth();

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

  // Fetch user's company data for nickname (Display Name shown in header)
  const { data: userCompany } = useQuery<{ id: string; name: string; nickname: string | null }>({
    queryKey: ["/api/companies", user?.companyId],
    enabled: !!user?.companyId,
  });

  // Update form when company settings data is loaded
  // Prioritize company's nickname for Display Name (what shows in header)
  useEffect(() => {
    if (companySettings) {
      companyForm.reset({
        companyName: companySettings.companyName || "",
        nickname: userCompany?.nickname || companySettings.nickname || "",
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
  }, [companySettings, userCompany, companyForm]);

  // Company info mutation 
  const updateCompanyMutation = useMutation({
    mutationFn: async (data: z.infer<typeof companyInfoSchema>) => {
      // Save to company_settings for other settings (tax rate, work hours, etc.)
      const response = await apiRequest("/api/company-settings", "PATCH", data);
      
      // Also save nickname (Display Name) to the user's company record for header display
      if (user?.companyId && data.nickname !== undefined) {
        await apiRequest(`/api/companies/${user.companyId}`, "PATCH", { 
          nickname: data.nickname 
        });
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      // Also invalidate company data so header updates
      if (user?.companyId) {
        queryClient.invalidateQueries({ queryKey: ["/api/companies", user.companyId] });
      }
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

  // Integrations Section Component
  const IntegrationsSection = () => {
    const [showSecret, setShowSecret] = useState(false);
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const { toast } = useToast();

    // Fetch Google Drive status
    const { data: driveStatus, isLoading: isDriveLoading, refetch: refetchDriveStatus } = useQuery<{
      connected: boolean;
      credentialsConfigured: boolean;
      email: string | null;
      tokenExpiry: Date | null;
      isExpired: boolean;
      connectedAt: Date | null;
      connectedBy: string | null;
      rootFolderId: string | null;
    }>({
      queryKey: ["/api/google-drive/status"],
    });

    // Save credentials mutation
    const saveCredentialsMutation = useMutation({
      mutationFn: async (data: { clientId: string; clientSecret: string }) => {
        const response = await apiRequest("/api/google-drive/credentials", "POST", data);
        return response.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/google-drive/status"] });
        toast({ title: "Google Drive credentials saved successfully" });
        setClientId("");
        setClientSecret("");
      },
      onError: (error: any) => {
        toast({
          title: "Failed to save credentials",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    // Connect to Google Drive mutation
    const connectDriveMutation = useMutation({
      mutationFn: async () => {
        const response = await apiRequest("/api/google-drive/auth-url", "GET");
        return response.json();
      },
      onSuccess: (data) => {
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      },
      onError: (error: any) => {
        toast({
          title: "Failed to connect Google Drive",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    // Disconnect Google Drive mutation
    const disconnectDriveMutation = useMutation({
      mutationFn: async () => {
        const response = await apiRequest("/api/google-drive/disconnect", "POST");
        return response.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/google-drive/status"] });
        toast({ title: "Google Drive disconnected successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to disconnect Google Drive",
          description: error.message,
          variant: "destructive",
        });
      },
    });

    const handleSaveCredentials = () => {
      if (!clientId.trim() || !clientSecret.trim()) {
        toast({
          title: "Missing fields",
          description: "Please enter both Client ID and Client Secret",
          variant: "destructive",
        });
        return;
      }
      saveCredentialsMutation.mutate({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Integrations</h2>
          <p className="text-muted-foreground">
            Connect external services to enhance your workflow
          </p>
        </div>

        {/* Google Drive Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <HardDrive className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  Google Drive
                  {driveStatus?.connected && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                  {driveStatus?.credentialsConfigured && !driveStatus?.connected && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Credentials Set
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Store and manage project files directly in your Google Drive
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* OAuth Credentials Configuration */}
            {!driveStatus?.connected && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  {driveStatus?.credentialsConfigured ? "Custom OAuth Credentials (Optional)" : "Step 1: Configure OAuth Credentials (Optional)"}
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  {driveStatus?.credentialsConfigured 
                    ? "Your custom credentials are configured. You can update them below or connect using these credentials."
                    : "Optionally provide your own Google Cloud OAuth 2.0 credentials for complete control over your Drive integration. If not configured, BuildPro's shared credentials will be used."
                  }
                  {" "}
                  <a 
                    href="https://console.cloud.google.com/apis/credentials" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Google Cloud Console
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="drive-client-id">Client ID</Label>
                    <Input
                      id="drive-client-id"
                      placeholder="123456789.apps.googleusercontent.com"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      data-testid="input-drive-client-id"
                    />
                  </div>
                  <div>
                    <Label htmlFor="drive-client-secret">Client Secret</Label>
                    <div className="relative">
                      <Input
                        id="drive-client-secret"
                        type={showSecret ? "text" : "password"}
                        placeholder="GOCSPX-..."
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        className="pr-10"
                        data-testid="input-drive-client-secret"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowSecret(!showSecret)}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-muted/50 p-3 rounded-md">
                    <h5 className="text-sm font-medium mb-2">Setup Instructions:</h5>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Go to Google Cloud Console and create a new project (or select existing)</li>
                      <li>Enable the Google Drive API</li>
                      <li>Create OAuth 2.0 credentials (Web application type)</li>
                      <li>Add authorized redirect URI: <code className="bg-background px-1 rounded">{window.location.origin}/api/google-drive/callback</code></li>
                      <li>Copy the Client ID and Client Secret here</li>
                    </ol>
                  </div>
                  
                  <Button
                    onClick={handleSaveCredentials}
                    disabled={saveCredentialsMutation.isPending || !clientId.trim() || !clientSecret.trim()}
                    data-testid="button-save-drive-credentials"
                  >
                    {saveCredentialsMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Credentials
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Connection Status and Actions */}
            {!driveStatus?.connected && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  {driveStatus?.credentialsConfigured ? "Step 2: Connect Google Drive" : "Connect Google Drive"}
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  {driveStatus?.credentialsConfigured 
                    ? "Your custom credentials are saved. Click below to authorize access to your Google Drive."
                    : "Click below to connect to Google Drive using BuildPro's shared credentials."
                  }
                </p>
                <Button
                  onClick={() => connectDriveMutation.mutate()}
                  disabled={connectDriveMutation.isPending}
                  data-testid="button-connect-drive"
                >
                  {connectDriveMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <HardDrive className="h-4 w-4 mr-2" />
                      Connect Google Drive
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Connected State */}
            {driveStatus?.connected && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium">Connected to Google Drive</p>
                      <p className="text-sm text-muted-foreground">
                        {driveStatus.email}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => disconnectDriveMutation.mutate()}
                    disabled={disconnectDriveMutation.isPending}
                    data-testid="button-disconnect-drive"
                  >
                    {disconnectDriveMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      "Disconnect"
                    )}
                  </Button>
                </div>

                {/* Update Credentials Option */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-medium mb-2">Update OAuth Credentials</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    If you need to change your Google Cloud credentials, disconnect first, then reconfigure.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // Company Info Section Component
  const CompanyInfoSection = () => (
    <div className="space-y-6">
      <Form {...companyForm}>
        <form className="space-y-6">
          {/* Company Information */}
          <Card className="border-2">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Company Details</CardTitle>
              <p className="text-sm text-muted-foreground">Your business name and contact information</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={companyForm.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Lighthouse Projects & Construction Pty Ltd"
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
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Lighthouse projects"
                          {...field}
                          disabled={!isEditing}
                          data-testid="company-nickname-input"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Short name shown in header (optional)
                      </FormDescription>
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
          <Card className="border-2">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Company Logo</CardTitle>
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
          <Card className="border-2">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Social Media</CardTitle>
              <p className="text-sm text-muted-foreground">Your company's social media profiles</p>
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

  // Group categories for sidebar
  const categoryGroups = [
    { key: "general", label: "General" },
    { key: "fields", label: "Configuration" },
    { key: "schedule", label: "Schedule" },
    { key: "defaults", label: "Defaults" },
    { key: "templates", label: "Templates" },
    { key: "integrations", label: "Integrations" },
    { key: "documents", label: "Documents" },
    { key: "activity", label: "Activity" }
  ];

  return (
    <div className="flex h-screen bg-background page-transition" data-testid="settings-page">
      {/* Left Sidebar - Minimalist styling */}
      <div className="w-72 border-r border-border bg-background flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center px-6 border-b border-border flex-shrink-0">
          <h1 className="text-sm font-semibold tracking-tight">Company Settings</h1>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {categoryGroups.map((group) => {
            const groupCategories = SETTINGS_CATEGORIES.filter(cat => cat.group === group.key);
            if (groupCategories.length === 0) return null;
            
            return (
              <div key={group.key} className="mb-4">
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {groupCategories.map((category) => {
                    const Icon = category.icon;
                    const isActive = activeSection === category.id;
                    
                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          if (category.navigateTo) {
                            navigate(category.navigateTo);
                          } else {
                            setActiveSection(category.id);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                          isActive 
                            ? "bg-[#bba7db] text-white" 
                            : "text-foreground hover-elevate"
                        }`}
                        data-testid={`settings-nav-${category.id}`}
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-medium">{category.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Control Header - Row 1: Title & Actions */}
        <div className="h-14 bg-background flex items-center justify-between px-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            {activeCategory && <activeCategory.icon className="h-5 w-5 text-muted-foreground" />}
            <h1 className="text-sm font-semibold">
              {activeCategory?.label || "Settings"}
            </h1>
          </div>
          {activeSection === "branding" && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit} data-testid="button-cancel-edit">
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={companyForm.handleSubmit(onSubmitCompanyInfo)}
                    disabled={updateCompanyMutation.isPending}
                    className="bg-[#bba7db] hover:bg-[#bba7db]/90"
                    data-testid="button-save-settings"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {updateCompanyMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <Button 
                  size="sm" 
                  onClick={handleEditCompanyInfo}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90"
                  data-testid="button-edit-settings"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-5xl">
            {/* Section Description */}
            <p className="text-sm text-muted-foreground mb-6">
              {activeCategory?.description || "Manage your company settings"}
            </p>

            {/* Content based on active section */}
            {activeSection === "branding" && <CompanyInfoSection />}
            {activeSection === "field-settings" && <FieldCategoriesSection />}
            {activeSection === "integrations" && <IntegrationsSection />}
            {activeSection === "schedule-settings" && <ScheduleSettingsSection />}
            {activeSection === "default-values" && <DefaultValuesSection />}
            {activeSection === "terms-conditions" && <TermsConditionsSection />}
            {activeSection === "activity" && <ActivitySection />}
            
            {/* Coming Soon placeholder for unimplemented sections */}
            {!["branding", "field-settings", "integrations", "schedule-settings", "default-values", "terms-conditions", "activity"].includes(activeSection) && (
              <Card className="border-2">
                <CardContent className="text-center py-16">
                  <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    {activeCategory && <activeCategory.icon className="h-8 w-8 text-muted-foreground" />}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {activeCategory?.label}
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    This settings section is under development and will be available soon.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Schedule Settings Section
function ScheduleSettingsSection() {
  const { toast } = useToast();
  const [workDays, setWorkDays] = useState({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false
  });
  const [workHours, setWorkHours] = useState({
    start: "07:00",
    end: "15:30"
  });
  const [defaultTaskDuration, setDefaultTaskDuration] = useState("8");
  const [bufferTime, setBufferTime] = useState("0");

  const handleSave = () => {
    localStorage.setItem('scheduleSettings', JSON.stringify({ workDays, workHours, defaultTaskDuration, bufferTime }));
    toast({ title: "Schedule settings saved" });
  };

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Working Days</CardTitle>
          <p className="text-sm text-muted-foreground">Select which days are working days for your company</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(workDays).map(([day, isActive]) => (
              <Button
                key={day}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkDays({ ...workDays, [day]: !isActive })}
                className={isActive ? "bg-[#bba7db] hover:bg-[#bba7db]/90" : ""}
                data-testid={`workday-${day}`}
              >
                {day.charAt(0).toUpperCase() + day.slice(1, 3)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Working Hours</CardTitle>
          <p className="text-sm text-muted-foreground">Default start and end times for the work day</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <Label className="text-sm font-medium">Start Time</Label>
              <Input
                type="time"
                value={workHours.start}
                onChange={(e) => setWorkHours({ ...workHours, start: e.target.value })}
                className="mt-1.5"
                data-testid="input-work-start"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">End Time</Label>
              <Input
                type="time"
                value={workHours.end}
                onChange={(e) => setWorkHours({ ...workHours, end: e.target.value })}
                className="mt-1.5"
                data-testid="input-work-end"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Task Defaults</CardTitle>
          <p className="text-sm text-muted-foreground">Default values for task scheduling</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <Label className="text-sm font-medium">Default Task Duration (hours)</Label>
              <Input
                type="number"
                value={defaultTaskDuration}
                onChange={(e) => setDefaultTaskDuration(e.target.value)}
                min="1"
                className="mt-1.5"
                data-testid="input-task-duration"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Buffer Time (minutes)</Label>
              <Input
                type="number"
                value={bufferTime}
                onChange={(e) => setBufferTime(e.target.value)}
                min="0"
                className="mt-1.5"
                data-testid="input-buffer-time"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="bg-[#bba7db] hover:bg-[#bba7db]/90" data-testid="button-save-schedule">
          <Save className="h-4 w-4 mr-2" />
          Save Schedule Settings
        </Button>
      </div>
    </div>
  );
}

// Default Values Section
function DefaultValuesSection() {
  const { toast } = useToast();
  const [defaults, setDefaults] = useState({
    defaultMarkup: "15",
    defaultPaymentTerms: "14",
    defaultTaxRate: "10",
    defaultUnit: "each",
    currencySymbol: "$",
    currencyPosition: "before"
  });

  const handleSave = () => {
    localStorage.setItem('defaultValues', JSON.stringify(defaults));
    toast({ title: "Default values saved" });
  };

  const unitOptions = ["each", "m", "m²", "m³", "kg", "L", "hours", "days", "lump sum"];

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Financial Defaults</CardTitle>
          <p className="text-sm text-muted-foreground">Default values for estimates, invoices, and financial calculations</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Default Markup (%)</Label>
              <Input
                type="number"
                value={defaults.defaultMarkup}
                onChange={(e) => setDefaults({ ...defaults, defaultMarkup: e.target.value })}
                min="0"
                max="100"
                className="mt-1.5"
                data-testid="input-default-markup"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Payment Terms (days)</Label>
              <Input
                type="number"
                value={defaults.defaultPaymentTerms}
                onChange={(e) => setDefaults({ ...defaults, defaultPaymentTerms: e.target.value })}
                min="0"
                className="mt-1.5"
                data-testid="input-payment-terms"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Default Tax Rate (%)</Label>
              <Input
                type="number"
                value={defaults.defaultTaxRate}
                onChange={(e) => setDefaults({ ...defaults, defaultTaxRate: e.target.value })}
                min="0"
                max="100"
                step="0.1"
                className="mt-1.5"
                data-testid="input-tax-rate"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Units & Currency</CardTitle>
          <p className="text-sm text-muted-foreground">Default units of measure and currency formatting</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Default Unit</Label>
              <Select 
                value={defaults.defaultUnit} 
                onValueChange={(value) => setDefaults({ ...defaults, defaultUnit: value })}
              >
                <SelectTrigger className="mt-1.5" data-testid="select-default-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map(unit => (
                    <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Currency Symbol</Label>
              <Input
                value={defaults.currencySymbol}
                onChange={(e) => setDefaults({ ...defaults, currencySymbol: e.target.value })}
                className="mt-1.5"
                maxLength={3}
                data-testid="input-currency-symbol"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Symbol Position</Label>
              <Select 
                value={defaults.currencyPosition} 
                onValueChange={(value) => setDefaults({ ...defaults, currencyPosition: value })}
              >
                <SelectTrigger className="mt-1.5" data-testid="select-currency-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">Before amount ($100)</SelectItem>
                  <SelectItem value="after">After amount (100$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="bg-[#bba7db] hover:bg-[#bba7db]/90" data-testid="button-save-defaults">
          <Save className="h-4 w-4 mr-2" />
          Save Default Values
        </Button>
      </div>
    </div>
  );
}

// Terms & Conditions Section (Buildern-style)
function TermsConditionsSection() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Array<{
    id: string;
    name: string;
    content: string;
    defaultFor: string[];
  }>>([
    {
      id: "1",
      name: "Client Invoices",
      content: "This payment claim is in accordance with your building contract and considers any adjustments to the contract price by variations (as applicable) that have been agreed, signed and accepted.\n\n1. Invoices must be paid within the days stated within the building contract. Failure to pay by the due date may result in a notice of intention to suspend work and, if not resolved, may also result in termination of the contract.\n2. If any financial delays arise, the client must notify the builder immediately.\n3. This invoice is calculated from the contract amount.\n4. If you have any disputes about this invoice, notify the builder immediately.",
      defaultFor: ["client_invoices"]
    },
    {
      id: "2", 
      name: "Purchase Orders",
      content: "Standard purchase order terms and conditions apply. All goods must be delivered to the specified site address. Payment terms are net 30 days from invoice date.",
      defaultFor: ["purchase_orders"]
    },
    {
      id: "3",
      name: "Quotes",
      content: "This quote is valid for 30 days from the date of issue. Prices are subject to change based on material availability. GST is included in all prices unless otherwise stated.",
      defaultFor: ["quotes"]
    }
  ]);
  const [editingTemplate, setEditingTemplate] = useState<typeof templates[0] | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);

  const documentTypes = [
    { value: "client_invoices", label: "Client Invoices" },
    { value: "purchase_orders", label: "Purchase Orders" },
    { value: "quotes", label: "Quotes" },
    { value: "contracts", label: "Contracts" },
    { value: "variations", label: "Variations" }
  ];

  const handleSaveTemplate = (template: typeof templates[0]) => {
    if (editingTemplate) {
      setTemplates(templates.map(t => t.id === template.id ? template : t));
    } else {
      setTemplates([...templates, { ...template, id: Date.now().toString() }]);
    }
    setEditingTemplate(null);
    setIsAddingTemplate(false);
    toast({ title: "Template saved successfully" });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
    toast({ title: "Template deleted" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Templates</h3>
          <p className="text-sm text-muted-foreground">Manage terms and conditions templates for different document types</p>
        </div>
        <Button 
          onClick={() => setIsAddingTemplate(true)} 
          className="bg-[#bba7db] hover:bg-[#bba7db]/90"
          data-testid="button-add-template"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create a Template
        </Button>
      </div>

      {/* Template List */}
      <div className="space-y-3">
        {templates.map((template) => (
          <Card key={template.id} className="border-2 hover-elevate">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm">{template.name}</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {template.content.substring(0, 150)}...
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {template.defaultFor.map(docType => {
                      const docLabel = documentTypes.find(d => d.value === docType)?.label || docType;
                      return (
                        <Badge key={docType} variant="secondary" className="text-xs">
                          {docLabel}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingTemplate(template)}
                    data-testid={`button-edit-template-${template.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTemplate(template.id)}
                    data-testid={`button-delete-template-${template.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit/Add Template Modal */}
      {(editingTemplate || isAddingTemplate) && (
        <TermsTemplateEditor
          template={editingTemplate || { id: "", name: "", content: "", defaultFor: [] }}
          documentTypes={documentTypes}
          onSave={handleSaveTemplate}
          onCancel={() => { setEditingTemplate(null); setIsAddingTemplate(false); }}
        />
      )}
    </div>
  );
}

// Terms Template Editor Component
function TermsTemplateEditor({
  template,
  documentTypes,
  onSave,
  onCancel
}: {
  template: { id: string; name: string; content: string; defaultFor: string[] };
  documentTypes: { value: string; label: string }[];
  onSave: (template: { id: string; name: string; content: string; defaultFor: string[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [content, setContent] = useState(template.content);
  const [defaultFor, setDefaultFor] = useState<string[]>(template.defaultFor);

  const handleSubmit = () => {
    onSave({ id: template.id, name, content, defaultFor });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="modal-template-editor">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="pb-4 flex-shrink-0">
          <CardTitle className="text-lg">
            {template.id ? "Edit the Terms and Conditions Template" : "Create Terms and Conditions Template"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-4">
          <div>
            <Label className="text-sm font-medium">Template Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client Invoices"
              className="mt-1.5"
              data-testid="input-template-name"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Create from scratch</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1.5 w-full min-h-[200px] p-3 border-2 rounded-md text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#bba7db] bg-background"
              placeholder="Enter your terms and conditions..."
              data-testid="textarea-template-content"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Default for</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {documentTypes.map(docType => (
                <Button
                  key={docType.value}
                  variant={defaultFor.includes(docType.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (defaultFor.includes(docType.value)) {
                      setDefaultFor(defaultFor.filter(d => d !== docType.value));
                    } else {
                      setDefaultFor([...defaultFor, docType.value]);
                    }
                  }}
                  className={defaultFor.includes(docType.value) ? "bg-[#bba7db] hover:bg-[#bba7db]/90" : ""}
                  data-testid={`toggle-doctype-${docType.value}`}
                >
                  {docType.label}
                  {defaultFor.includes(docType.value) && <X className="h-3 w-3 ml-1" />}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
        <div className="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <Button variant="outline" onClick={onCancel} data-testid="button-cancel-template">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            data-testid="button-save-template"
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Activity Feed Section Component
function ActivitySection() {
  const { toast } = useToast();
  
  // Activity types with labels, descriptions, and icons
  const ACTIVITY_TYPES = [
    { 
      key: "task", 
      label: "Tasks", 
      description: "Task creation, updates, and completion",
      icon: CheckSquare
    },
    { 
      key: "estimate", 
      label: "Estimates", 
      description: "Estimate creation and updates",
      icon: ClipboardList
    },
    { 
      key: "bill", 
      label: "Bills", 
      description: "Bill creation, updates, and payments",
      icon: Receipt
    },
    { 
      key: "variation", 
      label: "Variations", 
      description: "Variation creation, approval, and status changes",
      icon: FileCheck
    },
    { 
      key: "invoice", 
      label: "Invoices", 
      description: "Client invoice creation and payment tracking",
      icon: FileText
    },
    { 
      key: "proposal", 
      label: "Proposals", 
      description: "Proposal creation and status updates",
      icon: FileText
    },
    { 
      key: "project", 
      label: "Projects", 
      description: "Project creation and major updates",
      icon: Folder
    },
    { 
      key: "site_diary", 
      label: "Site Diary", 
      description: "Daily site diary entries",
      icon: StickyNote
    },
    { 
      key: "schedule", 
      label: "Schedule", 
      description: "Schedule item changes and updates",
      icon: Calendar
    },
    { 
      key: "other", 
      label: "Other", 
      description: "Miscellaneous activity items",
      icon: MoreHorizontal
    }
  ];

  // Fetch company settings to get current activity visibility
  const { data: companySettings, isLoading } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Local state for visibility toggles (default all visible)
  const [visibilityState, setVisibilityState] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    ACTIVITY_TYPES.forEach(type => {
      defaults[type.key] = true; // Default all visible
    });
    return defaults;
  });

  // Update local state when settings are loaded
  useEffect(() => {
    if (companySettings?.activityTypesVisible) {
      const savedVisibility = companySettings.activityTypesVisible as Record<string, boolean>;
      setVisibilityState(prev => {
        const merged = { ...prev };
        Object.keys(savedVisibility).forEach(key => {
          merged[key] = savedVisibility[key];
        });
        return merged;
      });
    }
  }, [companySettings]);

  // Mutation to save activity visibility settings
  const updateVisibilityMutation = useMutation({
    mutationFn: async (newVisibility: Record<string, boolean>) => {
      const response = await apiRequest("/api/company-settings", "PATCH", {
        activityTypesVisible: newVisibility
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "Activity visibility settings saved" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggle = (key: string, value: boolean) => {
    const newState = { ...visibilityState, [key]: value };
    setVisibilityState(newState);
    updateVisibilityMutation.mutate(newState);
  };

  const handleEnableAll = () => {
    const allEnabled: Record<string, boolean> = {};
    ACTIVITY_TYPES.forEach(type => {
      allEnabled[type.key] = true;
    });
    setVisibilityState(allEnabled);
    updateVisibilityMutation.mutate(allEnabled);
  };

  const handleDisableAll = () => {
    const allDisabled: Record<string, boolean> = {};
    ACTIVITY_TYPES.forEach(type => {
      allDisabled[type.key] = false;
    });
    setVisibilityState(allDisabled);
    updateVisibilityMutation.mutate(allDisabled);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const enabledCount = Object.values(visibilityState).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Activity Feed Items</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Select which types of activities appear in the activity feed. {enabledCount} of {ACTIVITY_TYPES.length} enabled.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleEnableAll}
                disabled={updateVisibilityMutation.isPending}
                data-testid="button-enable-all"
              >
                Enable All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDisableAll}
                disabled={updateVisibilityMutation.isPending}
                data-testid="button-disable-all"
              >
                Disable All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {ACTIVITY_TYPES.map((type) => {
              const Icon = type.icon;
              const isEnabled = visibilityState[type.key] ?? true;
              
              return (
                <div 
                  key={type.key}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    isEnabled ? "bg-background" : "bg-muted/30"
                  }`}
                  data-testid={`activity-type-${type.key}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center ${
                      isEnabled ? "bg-[#bba7db]/15" : "bg-muted"
                    }`}>
                      <Icon className={`h-4 w-4 ${
                        isEnabled ? "text-[#bba7db]" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${
                        isEnabled ? "text-foreground" : "text-muted-foreground"
                      }`}>
                        {type.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {type.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(type.key, checked)}
                    disabled={updateVisibilityMutation.isPending}
                    data-testid={`switch-activity-${type.key}`}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 bg-muted/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">About Activity Visibility</p>
              <p className="text-sm text-muted-foreground mt-1">
                Changes take effect immediately. Disabled activity types will be hidden from the activity feed 
                across all projects. This setting applies company-wide.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
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