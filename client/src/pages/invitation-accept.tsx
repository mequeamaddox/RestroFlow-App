  import { useState } from 'react';
  import { useParams, useLocation } from 'wouter';
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { useMutation, useQuery } from '@tanstack/react-query';
  import { z } from 'zod';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  import { Badge } from '@/components/ui/badge';
  import { Separator } from '@/components/ui/separator';
  import { useToast } from '@/hooks/use-toast';
  import { apiRequest } from '@/lib/queryClient';
  import { UserPlus, Mail, MapPin, Users, Briefcase, Clock, CheckCircle, AlertCircle, Eye, EyeOff, Shield, Building2 } from 'lucide-react';

  const acceptInvitationSchema = z.object({
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

  type AcceptInvitationFormData = z.infer<typeof acceptInvitationSchema>;

  interface InvitationDetails {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    location?: { name: string; address: string; };
    department?: { name: string; };
    position?: { title: string; };
    expiresAt: string;
  }

  export default function InvitationAccept() {
    const { token } = useParams<{ token: string }>();
    const [, setLocation] = useLocation();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const { toast } = useToast();

    const { data: invitation, isLoading: validatingToken, error: validationError } = useQuery<InvitationDetails>({
      queryKey: ['/api/invitations', token],
      queryFn: async () => {
        const response = await fetch(`/api/invitations/${token}`);
        if (!response.ok) throw new Error('Invalid or expired invitation');
        return response.json();
      },
      retry: false,
    });

    const form = useForm<AcceptInvitationFormData>({
      resolver: zodResolver(acceptInvitationSchema),
      defaultValues: { password: '', confirmPassword: '' },
    });

    const acceptInvitationMutation = useMutation({
      mutationFn: async (data: AcceptInvitationFormData) => {
        const response = await apiRequest('POST', `/api/invitations/${token}/accept`, {
          password: data.password,
        });
        return response.json();
      },
      onSuccess: () => {
        toast({ title: "Account Created", description: "Redirecting to login..." });
        setTimeout(() => setLocation('/login'), 2000);
      },
      onError: (error: Error) => {
        toast({ title: "Error", description: error.message || "Failed to create account", variant: "destructive" });
      },
    });

    const onSubmit = (data: AcceptInvitationFormData) => {
      acceptInvitationMutation.mutate(data);
    };

    const getRoleBadge = (role: string) => {
      const colors: Record<string, string> = {
        owner: 'bg-purple-100 text-purple-800',
        manager: 'bg-blue-100 text-blue-800',
        team_lead: 'bg-green-100 text-green-800',
        employee: 'bg-accent text-foreground',
      };
      return (
        <Badge className={colors[role] || colors.employee}>
          {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </Badge>
      );
    };

    const isExpired = invitation && new Date(invitation.expiresAt) < new Date();

    if (validatingToken) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
              <h3 className="text-lg font-semibold">Validating Invitation</h3>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (validationError || !invitation) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-semibold">Invalid Invitation</h3>
              <p className="text-muted-foreground">This invitation is invalid, expired, or already used.</p>
              <Button onClick={() => setLocation('/login')} variant="outline">Go to Login</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (isExpired) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <Clock className="h-12 w-12 text-orange-500 mx-auto" />
              <h3 className="text-lg font-semibold">Invitation Expired</h3>
              <p className="text-muted-foreground">Please contact your manager for a new invitation.</p>
              <Button onClick={() => setLocation('/login')} variant="outline">Go to Login</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (acceptInvitationMutation.isSuccess) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h3 className="text-lg font-semibold">Account Created!</h3>
              <p className="text-muted-foreground">Welcome to the team! Redirecting to login...</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Building2 className="h-8 w-8 text-blue-500" />
              <CardTitle className="text-2xl">RestroFlow</CardTitle>
            </div>
            <CardDescription className="text-lg">You've been invited to join the team!</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <UserPlus className="h-5 w-5" /> Invitation Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Email:</span>
                  </div>
                  <p className="text-sm">{invitation.email}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Role:</span>
                  </div>
                  {getRoleBadge(invitation.role)}
                </div>
                {invitation.location && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Location:</span>
                    </div>
                    <p className="text-sm">{invitation.location.name}</p>
                  </div>
                )}
                {invitation.department && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Department:</span>
                    </div>
                    <p className="text-sm">{invitation.department.name}</p>
                  </div>
                )}
                {invitation.position && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Position:</span>
                    </div>
                    <p className="text-sm">{invitation.position.title}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Create Your Account</h3>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" {...field} />
                            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>At least 8 characters with uppercase, lowercase, and number</FormDescription>
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
                            <Input type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm your password" {...field} />
                            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={acceptInvitationMutation.isPending}>
                    {acceptInvitationMutation.isPending
                      ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Creating Account...</>
                      : <><UserPlus className="h-4 w-4 mr-2" />Create Account & Join Team</>
                    }
                  </Button>
                </form>
              </Form>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>By creating an account, you agree to our terms of service and privacy policy.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }