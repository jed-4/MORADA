import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Building2, Lock, Loader2, CheckCircle2, XCircle } from 'lucide-react';

const resetSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetFormValues = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(search);
  const token = params.get('token') || '';
  const email = params.get('email') || '';

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const handleSubmit = async (values: ResetFormValues) => {
    if (!token || !email) {
      setErrorMessage('Invalid reset link. Please request a new one.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword: values.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.message || 'Failed to reset password.');
        setStatus('error');
      } else {
        setStatus('success');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Invalid Reset Link</h1>
          <p className="text-muted-foreground">This link is missing required information. Please request a new password reset.</p>
          <Button onClick={() => setLocation('/auth')}>Back to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary/10 p-3 rounded-xl">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">BuildPro</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set new password</CardTitle>
            <CardDescription>Choose a new password for {email}</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'success' ? (
              <div className="space-y-4 text-center py-2">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <p className="font-semibold">Password updated!</p>
                <p className="text-sm text-muted-foreground">You can now log in with your new password.</p>
                <Button className="w-full" onClick={() => setLocation('/auth')}>Go to Login</Button>
              </div>
            ) : status === 'error' ? (
              <div className="space-y-4">
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-start gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setLocation('/auth')}>
                  Back to Login
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input {...field} type="password" placeholder="At least 8 characters" className="pl-10" />
                          </div>
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
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input {...field} type="password" placeholder="Confirm your password" className="pl-10" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={status === 'loading'}>
                    {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set New Password'}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
