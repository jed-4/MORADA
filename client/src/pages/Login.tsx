import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, LogIn } from "lucide-react";

export default function Login() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('=== FORM SUBMITTED ===');
    console.log('Email:', email);
    
    if (!email || !password) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter both email and password",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('Sending POST to /api/auth/login...');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include', // Important for cookies
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      toast({
        title: "Welcome back!",
        description: "You've successfully logged in to BuildPro.",
      });

      console.log('Login successful, redirecting to app...');
      // Force hard redirect to app (root route is Dashboard)
      window.location.href = '/';
      
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Invalid email or password",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold">Welcome back</CardTitle>
            <CardDescription className="text-base">
              Log in to your BuildPro account
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                "Logging in..."
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  Log In
                </>
              )}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Don't have an account? </span>
            <a
              href="/signup"
              className="text-primary font-semibold hover:underline"
              data-testid="link-signup"
            >
              Sign up
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
