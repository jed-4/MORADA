import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Building2, LogOut, User, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { markWelcomeEmailBannerPending } from "@/components/WelcomeEmailBanner";

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

type PlanKey = "subbie" | "solo" | "builder" | "studio";
type BillingCycle = "monthly" | "annual";

const PLAN_CARDS: {
  key: PlanKey;
  name: string;
  monthly: number;
  annual: number;
  popular?: boolean;
  tagline: string;
  highlights: string[];
}[] = [
  {
    key: "subbie",
    name: "Subbie",
    monthly: 35,
    annual: 350,
    tagline: "For solo trades getting started",
    highlights: ["1 active project", "1 user included", "5 GB storage"],
  },
  {
    key: "solo",
    name: "Solo",
    monthly: 149,
    annual: 1490,
    tagline: "For small teams running a few jobs",
    highlights: ["3 active projects", "2 users included", "25 GB storage"],
  },
  {
    key: "builder",
    name: "Builder",
    monthly: 249,
    annual: 2490,
    popular: true,
    tagline: "For growing residential builders",
    highlights: ["10 active projects", "5 users included", "100 GB storage"],
  },
  {
    key: "studio",
    name: "Studio",
    monthly: 349,
    annual: 3490,
    tagline: "For established multi-project builders",
    highlights: ["Unlimited projects", "15 users included", "Unlimited storage"],
  },
];

export default function OnboardingPage() {
  const { toast } = useToast();
  const { logout, user } = useAuth();
  // The register form already collects first/last name, so the profile step
  // only appears when they're missing (e.g. Google OAuth signups without a
  // usable name). Everyone else starts straight at company creation.
  const [needsProfile] = useState(() => !user?.firstName || !user?.lastName);
  const [step, setStep] = useState<1 | 2 | 3>(needsProfile ? 1 : 2);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("builder");
  const totalSteps = needsProfile ? 3 : 2;
  const displayStep = needsProfile ? step : step - 1;
  
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
      // Pass along a saved referral code (captured from a ?ref= signup link)
      // so the new company is linked to whoever referred them.
      const referralCode = localStorage.getItem('morada_referral_code') || undefined;
      return await apiRequest('/api/companies', 'POST', { ...values, referralCode });
    },
    onSuccess: () => {
      localStorage.removeItem('morada_referral_code');
      // Do NOT invalidate the user cache here — that would give the client a
      // companyId and route it out of onboarding before the plan is chosen.
      // Move to the plan step and only refresh once a plan is selected.
      setStep(3);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create company",
        variant: "destructive",
      });
    },
  });

  const selectPlanMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/billing/select-plan', 'POST', {
        planKey: selectedPlan,
        billingCycle,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      // Arm the "check your inbox" banner for the first app load. Set only
      // here, so it can only ever fire for a brand-new signup.
      markWelcomeEmailBannerPending();
      toast({
        title: "You're all set!",
        description: "Your 14-day free trial has started.",
      });
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start your trial",
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
      <div className={`w-full ${step === 3 ? "max-w-5xl" : "max-w-2xl"}`}>
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
            <span className="text-3xl font-bold text-foreground" data-testid="text-logo-onboarding">Morada</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-onboarding-title">
            {step === 1
              ? "Welcome to Morada!"
              : step === 2
                ? (needsProfile ? "Create Your Company" : "Welcome to Morada!")
                : "Start your 14-day free trial"}
          </h1>
          <p className="text-muted-foreground mb-1" data-testid="text-onboarding-subtitle">
            {step === 1
              ? "Let's start by completing your profile"
              : step === 2
                ? "Let's set up your company details"
                : "No card required. Pick the plan that fits — you can change it any time."}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-step-indicator">
            Step {displayStep} of {totalSteps}
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

                  <div className={`flex ${needsProfile ? "justify-between" : "justify-end"} pt-4`}>
                    {needsProfile && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(1)}
                        data-testid="button-back"
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="lg"
                      disabled={createCompanyMutation.isPending}
                      data-testid="button-complete-setup"
                    >
                      {createCompanyMutation.isPending ? "Creating..." : "Continue"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <div className="space-y-6">
            {/* The trial is the offer — say so before the price cards, not in
                fine print underneath them. Truthful as built: no card is
                collected anywhere in this flow. */}
            <div
              className="rounded-lg border-2 border-primary bg-[hsl(var(--primary-light))] px-5 py-4 text-center"
              data-testid="banner-trial-offer"
            >
              <p className="text-lg font-semibold text-foreground sm:text-xl">
                Start your 14-day free trial — no card required
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing is charged today and you won't be asked for card details to start.
                Pick a plan below so we know what to set you up with.
              </p>
              <div className="flex justify-center pt-3">
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => selectPlanMutation.mutate()}
                  disabled={selectPlanMutation.isPending}
                  data-testid="button-start-trial-top"
                >
                  {selectPlanMutation.isPending ? "Starting your trial..." : "Start 14-day free trial"}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="inline-flex items-center gap-1 rounded-md border p-1" role="tablist" aria-label="Billing cycle">
                <Button
                  type="button"
                  variant={billingCycle === "monthly" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setBillingCycle("monthly")}
                  data-testid="button-cycle-monthly"
                >
                  Monthly
                </Button>
                <Button
                  type="button"
                  variant={billingCycle === "annual" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setBillingCycle("annual")}
                  data-testid="button-cycle-annual"
                >
                  Annual
                  <Badge variant="secondary" className="ml-2">2 months free</Badge>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_CARDS.map((plan) => {
                const isSelected = selectedPlan === plan.key;
                const price = billingCycle === "monthly" ? plan.monthly : plan.annual;
                const perMonth = billingCycle === "annual" ? Math.round(plan.annual / 12) : plan.monthly;
                return (
                  <Card
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`relative flex flex-col cursor-pointer hover-elevate ${isSelected ? "border-primary ring-1 ring-primary" : ""}`}
                    data-testid={`card-plan-${plan.key}`}
                  >
                    {plan.popular && (
                      <Badge className="absolute -top-2 right-3">Most Popular</Badge>
                    )}
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <CardDescription>{plan.tagline}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-foreground">${price.toLocaleString()}</span>
                          <span className="text-sm text-muted-foreground">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
                        </div>
                        {billingCycle === "annual" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            ${perMonth.toLocaleString()}/mo billed annually
                          </p>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {plan.highlights.map((h) => (
                          <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto pt-2">
                        <Badge variant={isSelected ? "default" : "outline"} className="w-full justify-center">
                          {isSelected ? "Selected" : "Select"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Nothing is charged during the 14-day trial and no card is needed to start. You can change or cancel your plan anytime.
              {selectedPlan === "subbie"
                ? " Your trial runs on the Subbie tier."
                : " Your trial includes full Studio access, so you can try everything."}
            </p>

            <div className="flex justify-center pt-2">
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => selectPlanMutation.mutate()}
                disabled={selectPlanMutation.isPending}
                data-testid="button-start-trial"
              >
                {selectPlanMutation.isPending ? "Starting your trial..." : "Start 14-day free trial"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
