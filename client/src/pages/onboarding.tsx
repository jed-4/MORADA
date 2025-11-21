import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Building2, LogOut, User } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const userProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const companyFormSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  abn: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
});

type UserProfileValues = z.infer<typeof userProfileSchema>;
type CompanyFormValues = z.infer<typeof companyFormSchema>;

export default function OnboardingPage() {
  const { toast } = useToast();
  const { logout, user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  
  const userProfileForm = useForm<UserProfileValues>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
    },
  });

  const companyForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: "",
      abn: "",
      address: "",
      phone: "",
      email: "",
      website: "",
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (values: UserProfileValues) => {
      if (!user?.id) throw new Error("No user ID");
      return await apiRequest(`/api/users/${user.id}`, 'PATCH', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      setStep(2);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      return await apiRequest('/api/companies', 'POST', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Success",
        description: "Your company has been set up successfully!",
      });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create company",
        variant: "destructive",
      });
    },
  });

  const onUserProfileSubmit = (values: UserProfileValues) => {
    updateUserMutation.mutate(values);
  };

  const onCompanySubmit = (values: CompanyFormValues) => {
    createCompanyMutation.mutate(values);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex justify-end mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
        
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Building2 className="h-10 w-10 text-primary" data-testid="logo-icon-onboarding" />
            <span className="text-3xl font-bold text-foreground" data-testid="text-logo-onboarding">BuildPro</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-onboarding-title">
            {step === 1 ? "Welcome to BuildPro!" : "Create Your Company"}
          </h1>
          <p className="text-muted-foreground mb-1" data-testid="text-onboarding-subtitle">
            {step === 1 
              ? "Let's start by completing your profile" 
              : "Now let's set up your company details"}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-step-indicator">
            Step {step} of 2
          </p>
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle data-testid="text-form-title">Your Profile</CardTitle>
              </div>
              <CardDescription data-testid="text-form-description">
                Tell us a bit about yourself. You can update these details later in settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...userProfileForm}>
                <form onSubmit={userProfileForm.handleSubmit(onUserProfileSubmit)} className="space-y-4">
                  <FormField
                    control={userProfileForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. John" 
                            {...field}
                            data-testid="input-first-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={userProfileForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. Smith" 
                            {...field}
                            data-testid="input-last-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      size="lg"
                      disabled={updateUserMutation.isPending}
                      data-testid="button-continue"
                    >
                      {updateUserMutation.isPending ? "Saving..." : "Continue"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle data-testid="text-form-title">Company Details</CardTitle>
              </div>
              <CardDescription data-testid="text-form-description">
                Enter your company information. You can update these details later in settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...companyForm}>
                <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-4">
                  <FormField
                    control={companyForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. Smith Builders" 
                            {...field}
                            data-testid="input-company-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={companyForm.control}
                    name="abn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ABN (Australian Business Number)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. 12 345 678 901" 
                            {...field}
                            data-testid="input-abn"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={companyForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Address</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. 123 Main St, Sydney NSW 2000" 
                            {...field}
                            data-testid="input-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={companyForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. (02) 1234 5678" 
                              {...field}
                              data-testid="input-phone"
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
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              type="email"
                              placeholder="e.g. contact@smithbuilders.com.au" 
                              {...field}
                              data-testid="input-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={companyForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g. https://smithbuilders.com.au" 
                            {...field}
                            data-testid="input-website"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-between pt-4">
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => setStep(1)}
                      data-testid="button-back"
                    >
                      Back
                    </Button>
                    <Button 
                      type="submit" 
                      size="lg"
                      disabled={createCompanyMutation.isPending}
                      data-testid="button-complete-setup"
                    >
                      {createCompanyMutation.isPending ? "Creating..." : "Complete Setup"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
