import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Building2, User, Mail } from "lucide-react";

const acceptInvitationSchema = z.object({
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AcceptInvitationForm = z.infer<typeof acceptInvitationSchema>;

interface InvitationDetails {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  companyId: string;
  invitedBy: string;
  status: string;
  expiresAt: string;
  projectIds: string[] | null;
}

export default function AcceptInvitation() {
  const [, params] = useRoute("/accept-invite/:token");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = params?.token;

  const form = useForm<AcceptInvitationForm>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
  });

  useEffect(() => {
    async function fetchInvitation() {
      if (!token) {
        setError("Invalid invitation link");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/invitations/by-token/${token}`);
        
        if (!response.ok) {
          // Try to parse JSON error, fall back to status text
          let errorMessage = "Failed to fetch invitation";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setInvitation(data);
        
        // Pre-fill the form with invitation details
        form.reset({
          password: "",
          confirmPassword: "",
          firstName: data.firstName || "",
          lastName: data.lastName || "",
        });
      } catch (err: any) {
        setError(err.message || "Failed to load invitation");
      } finally {
        setIsLoading(false);
      }
    }

    fetchInvitation();
  }, [token, form]);

  async function onSubmit(values: AcceptInvitationForm) {
    if (!token || !invitation) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: values.password,
          firstName: values.firstName || invitation.firstName,
          lastName: values.lastName || invitation.lastName,
        }),
      });

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        // Try to parse JSON error response, fall back to status text
        let errorMessage = "Failed to accept invitation";
        let errorDetails = "";
        
        try {
          const data = await response.json();
          errorMessage = data.error || data.message || errorMessage;
          // Handle details as array or string
          if (data.details) {
            if (Array.isArray(data.details)) {
              errorDetails = data.details.join(", ");
            } else {
              errorDetails = String(data.details);
            }
          }
        } catch {
          // Non-JSON response, use status text
          errorMessage = response.statusText || errorMessage;
        }
        
        const fullError = errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage;
        throw new Error(fullError);
      }

      // Parse successful response
      const data = await response.json();

      // Check if auto-login succeeded
      const autoLoginFailed = data.message?.includes("Please log in");
      
      if (autoLoginFailed) {
        // Session save failed - show success but ask user to log in manually
        toast({
          title: "Account Created",
          description: "Your account has been created. Please log in to continue.",
        });
        // Redirect to login page after a delay
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 2000);
      } else {
        // Auto-login succeeded
        toast({
          title: "Welcome to BuildPro!",
          description: "Your account has been created successfully.",
        });
        // Redirect to dashboard (user is now logged in via session)
        setTimeout(() => {
          navigate("/");
        }, 500);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to accept invitation",
        description: err.message || "Please try again or contact support.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full" data-testid="button-back-home">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <CardTitle className="text-2xl">You're Invited!</CardTitle>
            <CardDescription className="text-base">
              Join <span className="font-semibold text-foreground">{invitation.company || "the team"}</span> on BuildPro
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{invitation.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="font-medium">{invitation.company || "Not specified"}</p>
              </div>
            </div>

            {invitation.projectIds && invitation.projectIds.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Project Access</p>
                  <p className="font-medium">{invitation.projectIds.length} project(s)</p>
                </div>
              </div>
            )}
          </div>

          {/* Account Setup Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-first-name" />
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
                        <Input {...field} data-testid="input-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Create a strong password"
                        {...field}
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Confirm your password"
                        {...field}
                        data-testid="input-confirm-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting}
                data-testid="button-accept-invitation"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Accept Invitation & Create Account"
                )}
              </Button>
            </form>
          </Form>

          <p className="text-xs text-center text-muted-foreground">
            By accepting this invitation, you agree to join {invitation.company || "the team"} on BuildPro.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
