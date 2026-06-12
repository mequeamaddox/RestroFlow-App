import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
// Server-side authentication handled by Clerk

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onToggleMode: () => void;
}

export function LoginForm({ onToggleMode }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [, setLocation] = useLocation();
  const { refreshAuth } = useAuth();
  
  // Server-side authentication function with session cookies
  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔐 Attempting server-side authentication for:', email);
      
      // Call the server-side authentication endpoint
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // Include cookies for session management
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Server authentication failed:', errorData);
        return { user: null, error: errorData.message || 'Authentication failed' };
      }
      
      const data = await response.json();
      console.log('✅ Server authentication successful for:', data.user.email);
      
      // Refresh authentication state to load user data from session cookie
      await refreshAuth();
      
      // Redirect to dashboard after successful login
      console.log('✅ Login successful, redirecting to dashboard...');
      setLocation('/');
      return { user: data.user, error: null };
    } catch (error: any) {
      console.error('🚨 Server authentication error:', error);
      return { user: null, error: 'Network error. Please check your connection and try again.' };
    }
  };

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    const { error: signInError } = await signIn(data.email.trim().toLowerCase(), data.password.trim());
    
    if (signInError) {
      setError(signInError);
    }
    
    setIsLoading(false);
  };

  const handlePasswordReset = async () => {
    // Password reset handled by Clerk
    setError('Password reset is currently unavailable. Please contact your administrator.');
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Sign In</CardTitle>
        <CardDescription className="text-center">
          Enter your credentials to access RestroFlow
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input 
                        placeholder="Enter your email" 
                        className="pl-10"
                        data-testid="input-email"
                        {...field}
                      />
                    </div>
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input 
                        type="password" 
                        placeholder="Enter your password"
                        className="pl-10"
                        data-testid="input-password"
                        {...field} 
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {resetEmailSent && (
              <Alert>
                <AlertDescription>
                  Password reset email sent! Check your inbox and follow the instructions to reset your password.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                data-testid="button-sign-in"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
              <Button 
                type="button" 
                variant="link" 
                onClick={handlePasswordReset}
                disabled={isLoading || resetEmailSent}
                className="w-full text-sm"
                data-testid="button-forgot-password"
              >
                Forgot Password?
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="text-center">
        <Button 
          variant="link" 
          onClick={onToggleMode}
          className="text-sm"
          data-testid="button-toggle-signup"
        >
          Need an account? Contact your administrator
        </Button>
      </CardFooter>
    </Card>
  );
}