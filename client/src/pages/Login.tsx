import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, LogIn } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Login failed");
      }
      
      toast({
        title: "Login successful",
        description: "Welcome to BuildPro!",
      });
      
      onLoginSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid username or password",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = () => {
    form.setValue("username", "testuser_PymwZ9t-");
    form.setValue("password", "test-password");
    form.handleSubmit(onSubmit)();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5 flex items-center justify-center p-6 page-transition">
      <Card className="w-full max-w-md card-enhanced shadow-2xl border-2">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-lg">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Welcome to BuildPro</CardTitle>
            <p className="text-muted-foreground text-base">
              Professional project management for Australian builders
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Username</FormLabel>
                    <FormControl>
                      <Input {...field} className="focus-enhanced" placeholder="Enter your username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        className="focus-enhanced"
                        placeholder="Enter your password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full btn-enhanced shadow-lg text-base font-medium h-12" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="loading-enhanced">Logging in...</div>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 mr-2" />
                    Log In to BuildPro
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Demo Access</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleQuickLogin}
            className="w-full btn-enhanced shadow-md text-base font-medium h-12 border-2"
          >
            Quick Demo Login
          </Button>

          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>Demo credentials:</p>
            <code className="bg-muted px-2 py-1 rounded text-xs">testuser_PymwZ9t- / test-password</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}