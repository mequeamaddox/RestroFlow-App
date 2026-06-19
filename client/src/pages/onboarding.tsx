import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Building2, 
  Users2, 
  UserCheck, 
  Settings, 
  Mail, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Star,
  MapPin,
  Phone,
  Clock,
  ChefHat,
  Utensils,
  Wine
} from "lucide-react";
import { useLocation } from "wouter";

// Step definitions and schemas
const ONBOARDING_STEPS = [
  {
    key: "restaurant_info",
    title: "Restaurant Information",
    description: "Tell us about your restaurant",
    icon: Building2,
    required: true
  },
  {
    key: "departments", 
    title: "Department Setup",
    description: "Organize your restaurant operations",
    icon: Users2,
    required: true
  },
  {
    key: "positions",
    title: "Staff Positions", 
    description: "Define roles and responsibilities",
    icon: UserCheck,
    required: true
  },
  {
    key: "hr_addon",
    title: "HR Features",
    description: "Enable employee management tools",
    icon: Settings,
    required: false
  },
  {
    key: "employee_invitations",
    title: "Invite Your Team",
    description: "Send invitations to your staff",
    icon: Mail,
    required: false
  }
];

// Form schemas for each step
const restaurantInfoSchema = z.object({
  name: z.string().min(2, "Restaurant name is required"),
  type: z.string().min(1, "Restaurant type is required"),
  address: z.string().min(5, "Address is required"),
  phone: z.string().optional(),
  manager: z.string().min(2, "Manager name is required"),
  cuisine: z.string().optional(),
  seatingCapacity: z.string().optional(),
  operatingHours: z.object({
    openTime: z.string().optional(),
    closeTime: z.string().optional(),
    daysOpen: z.array(z.string()).optional()
  }).optional()
});

const departmentsSchema = z.object({
  departments: z.array(z.object({
    name: z.string().min(2, "Department name is required"),
    description: z.string().optional(),
    budget: z.string().optional()
  })).min(1, "At least one department is required")
});

const positionsSchema = z.object({
  positions: z.array(z.object({
    title: z.string().min(2, "Position title is required"),
    departmentId: z.string().min(1, "Department is required"),
    description: z.string().optional(),
    minHourlyRate: z.string().optional(),
    maxHourlyRate: z.string().optional(),
    requirements: z.string().optional()
  })).min(1, "At least one position is required")
});

const hrAddonSchema = z.object({
  enableHR: z.boolean().default(false),
  selectedFeatures: z.array(z.string()).optional(),
  enableForLocations: z.array(z.string()).optional()
});

const employeeInvitationsSchema = z.object({
  invitations: z.array(z.object({
    firstName: z.string().min(2, "First name is required"),
    lastName: z.string().min(2, "Last name is required"),
    email: z.string().email("Valid email is required"),
    positionId: z.string().min(1, "Position is required"),
    departmentId: z.string().min(1, "Department is required"),
    hourlyRate: z.string().optional()
  }))
});

interface OnboardingData {
  restaurant_info?: z.infer<typeof restaurantInfoSchema>;
  departments?: z.infer<typeof departmentsSchema>;
  positions?: z.infer<typeof positionsSchema>;
  hr_addon?: z.infer<typeof hrAddonSchema>;
  employee_invitations?: z.infer<typeof employeeInvitationsSchema>;
}

interface OnboardingProgress {
  id?: string;
  userId: string;
  isCompleted: boolean;
  currentStep: string;
  completedSteps: number;
  totalSteps: number;
  data: Record<string, any>;
}

export default function Onboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});
  const [isCompleting, setIsCompleting] = useState(false);
  const startedRef = useRef(false);

  const isOwnerLevel = (role?: string) => role === 'owner' || role === 'platform_admin';

  // Redirect if not owner
  useEffect(() => {
    if (user && !isOwnerLevel(user.role)) {
      setLocation('/');
      toast({
        title: "Access Denied",
        description: "Onboarding is only available to business owners.",
        variant: "destructive"
      });
    }
  }, [user, setLocation, toast]);

  // Get onboarding progress
  const { data: progress, isLoading: isLoadingProgress, error: progressError } = useQuery<OnboardingProgress>({
    queryKey: ['/api/owner-onboarding/progress'],
    enabled: isOwnerLevel(user?.role),
    retry: false,
  });

  // Get user's locations so we can pass locationId when sending invitations
  const { data: locations = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/locations'],
    enabled: isOwnerLevel(user?.role),
  });

  // Start onboarding mutation
  const startOnboardingMutation = useMutation<OnboardingProgress>({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/owner-onboarding/start');
      return res.json();
    },
    onSuccess: (data) => {
      setOnboardingData(data.data || {});
      const stepIndex = ONBOARDING_STEPS.findIndex(step => step.key === data.currentStep);
      setCurrentStep(Math.max(0, stepIndex));
    },
    onError: () => {
      toast({
        title: "Setup Error",
        description: "Could not start onboarding. Please refresh and try again.",
        variant: "destructive"
      });
    }
  });

  // Update step mutation
  const updateStepMutation = useMutation({
    mutationFn: async ({ stepName, stepData, status = 'completed' }: { stepName: string; stepData: any; status?: string }) => {
      const res = await apiRequest('PUT', '/api/owner-onboarding/step', { stepName, stepData, status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/owner-onboarding/progress'] });
    }
  });

  // Complete onboarding mutation
  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/owner-onboarding/complete');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Onboarding Complete!",
        description: "Welcome to RestroFlow! Your restaurant is ready to manage."
      });
      setLocation('/');
    }
  });

  // Initialize onboarding once when progress query settles
  useEffect(() => {
    if (!isOwnerLevel(user?.role)) return;
    if (isLoadingProgress) return;
    if (startedRef.current) return;
    startedRef.current = true;

    if (progressError) {
      // Server error (e.g. table not ready) — mutate will handle retry
      startOnboardingMutation.mutate();
      return;
    }

    if (progress?.id) {
      // Existing DB record — resume from saved state
      setOnboardingData(progress.data || {});
      const stepIndex = ONBOARDING_STEPS.findIndex(step => step.key === progress.currentStep);
      setCurrentStep(Math.max(0, stepIndex));
    } else {
      // No record yet (server returned default) — create one
      startOnboardingMutation.mutate();
    }
  }, [user?.role, isLoadingProgress, progress, progressError]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStepComplete = async (stepData: any) => {
    const currentStepKey = ONBOARDING_STEPS[currentStep].key;
    const updatedData = { ...onboardingData, [currentStepKey]: stepData };
    setOnboardingData(updatedData);

    // Save progress to backend
    await updateStepMutation.mutateAsync({ stepName: currentStepKey, stepData });

    // If this is the employee invitations step, send the actual invitations
    if (currentStepKey === 'employee_invitations' && stepData?.invitations?.length > 0) {
      const firstLocationId = locations[0]?.id;
      const sentCount = { success: 0, failed: 0 };
      for (const invite of stepData.invitations) {
        if (!invite.email) continue;
        try {
          await apiRequest('POST', '/api/invitations', {
            email: invite.email,
            role: 'employee',
            firstName: invite.firstName,
            lastName: invite.lastName,
            locationId: firstLocationId,
            expiresInHours: 168, // 7 days
          });
          sentCount.success++;
        } catch {
          sentCount.failed++;
        }
      }
      if (sentCount.success > 0) {
        toast({
          title: `${sentCount.success} invitation${sentCount.success > 1 ? 's' : ''} sent`,
          description: sentCount.failed > 0 ? `${sentCount.failed} failed to send` : "Team members will receive an email to create their accounts.",
        });
      } else if (sentCount.failed > 0) {
        toast({ title: "Invitations failed", description: "Could not send invitations. You can retry from HR → Invitations.", variant: "destructive" });
      }
    }

    // Move to next step or complete
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsCompleting(true);
      await completeOnboardingMutation.mutateAsync();
    }
  };

  const handleSkipStep = async () => {
    const currentStepKey = ONBOARDING_STEPS[currentStep].key;
    
    if (!ONBOARDING_STEPS[currentStep].required) {
      // Save as skipped
      await updateStepMutation.mutateAsync({ stepName: currentStepKey, stepData: null, status: 'skipped' });
      
      if (currentStep < ONBOARDING_STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        setIsCompleting(true);
        await completeOnboardingMutation.mutateAsync();
      }
    }
  };

  const progressPercent = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  const isInitializing = isLoadingProgress || startOnboardingMutation.isPending;

  if (!user || !isOwnerLevel(user.role)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading onboarding...</div>
      </div>
    );
  }

  if (startOnboardingMutation.isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 bg-slate-800 border-slate-700">
          <CardHeader className="text-center">
            <CardTitle className="text-red-400">Setup Unavailable</CardTitle>
            <CardDescription className="text-slate-300">
              We couldn't connect to the onboarding service. This is usually a temporary issue.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              onClick={() => { startedRef.current = false; startOnboardingMutation.reset(); }}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Setting up your workspace...</div>
      </div>
    );
  }

  if (isCompleting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Setup Complete!</CardTitle>
            <CardDescription>
              Your restaurant onboarding is complete. Redirecting to your dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to RestroFlow</h1>
          <p className="text-slate-300">Let's set up your restaurant management system</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-300">
              Step {currentStep + 1} of {ONBOARDING_STEPS.length}
            </span>
            <span className="text-sm text-slate-300">
              {Math.round(progressPercent)}% Complete
            </span>
          </div>
          <Progress value={progressPercent} className="h-2 bg-slate-700" />
        </div>

        {/* Step Navigation */}
        <div className="flex justify-between mb-8 overflow-x-auto">
          {ONBOARDING_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <div
                key={step.key}
                className={`flex flex-col items-center min-w-0 flex-1 px-2 ${
                  isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-slate-500'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                  isActive ? 'bg-blue-600' : isCompleted ? 'bg-green-600' : 'bg-slate-700'
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs text-center font-medium">{step.title}</span>
                {step.required && (
                  <Badge variant="secondary" className="text-xs mt-1">Required</Badge>
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                {(() => { const StepIcon = ONBOARDING_STEPS[currentStep].icon; return <StepIcon className="w-6 h-6 text-white" />; })()}
              </div>
              <div>
                <CardTitle className="text-white">{ONBOARDING_STEPS[currentStep].title}</CardTitle>
                <CardDescription>{ONBOARDING_STEPS[currentStep].description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {currentStep === 0 && (
              <RestaurantInfoStep
                data={onboardingData.restaurant_info}
                onComplete={handleStepComplete}
                isLoading={updateStepMutation.isPending}
              />
            )}
            {currentStep === 1 && (
              <DepartmentsStep
                data={onboardingData.departments}
                onComplete={handleStepComplete}
                isLoading={updateStepMutation.isPending}
              />
            )}
            {currentStep === 2 && (
              <PositionsStep
                data={onboardingData.positions}
                departmentsData={onboardingData.departments}
                onComplete={handleStepComplete}
                isLoading={updateStepMutation.isPending}
              />
            )}
            {currentStep === 3 && (
              <HRAddonStep
                data={onboardingData.hr_addon}
                onComplete={handleStepComplete}
                onSkip={handleSkipStep}
                isLoading={updateStepMutation.isPending}
              />
            )}
            {currentStep === 4 && (
              <EmployeeInvitationsStep
                data={onboardingData.employee_invitations}
                departmentsData={onboardingData.departments}
                positionsData={onboardingData.positions}
                onComplete={handleStepComplete}
                onSkip={handleSkipStep}
                isLoading={updateStepMutation.isPending}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          {!ONBOARDING_STEPS[currentStep].required && (
            <Button
              variant="ghost"
              onClick={handleSkipStep}
              disabled={updateStepMutation.isPending}
              className="text-slate-400 hover:text-white"
            >
              Skip Step
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Components
function RestaurantInfoStep({ data, onComplete, isLoading }: {
  data?: z.infer<typeof restaurantInfoSchema>;
  onComplete: (data: any) => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof restaurantInfoSchema>>({
    resolver: zodResolver(restaurantInfoSchema),
    defaultValues: {
      name: data?.name || "",
      type: data?.type || "",
      address: data?.address || "",
      phone: data?.phone || "",
      manager: data?.manager || "",
      cuisine: data?.cuisine || "",
      seatingCapacity: data?.seatingCapacity || "",
      operatingHours: {
        openTime: data?.operatingHours?.openTime || "",
        closeTime: data?.operatingHours?.closeTime || "",
        daysOpen: data?.operatingHours?.daysOpen || []
      }
    }
  });

  const onSubmit = (values: z.infer<typeof restaurantInfoSchema>) => {
    onComplete(values);
  };

  const restaurantTypes = [
    { value: "restaurant", label: "Full Service Restaurant", icon: Utensils },
    { value: "fast_casual", label: "Fast Casual", icon: ChefHat },
    { value: "bar", label: "Bar & Grill", icon: Wine },
    { value: "cafe", label: "Café", icon: Building2 },
    { value: "food_truck", label: "Food Truck", icon: Building2 }
  ];

  const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div data-testid="step-restaurant-info" className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Restaurant Name *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your restaurant name" 
                      {...field}
                      data-testid="input-restaurant-name"
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Restaurant Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-restaurant-type" className="bg-slate-700 border-slate-600 text-white">
                        <SelectValue placeholder="Select restaurant type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {restaurantTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="w-4 h-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Address *
                </FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Enter full address including city, state, zip" 
                    {...field}
                    data-testid="input-restaurant-address"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="(555) 123-4567" 
                      {...field}
                      data-testid="input-restaurant-phone"
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="manager"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Manager Name *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Primary manager name" 
                      {...field}
                      data-testid="input-manager-name"
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="seatingCapacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Seating Capacity</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      placeholder="50" 
                      {...field}
                      data-testid="input-seating-capacity"
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="cuisine"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Cuisine Type</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Italian, Mexican, American, etc." 
                    {...field}
                    data-testid="input-cuisine-type"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                  />
                </FormControl>
                <FormDescription className="text-slate-400">
                  What type of food does your restaurant serve?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white">
              <Clock className="w-4 h-4" />
              <span className="font-medium">Operating Hours (Optional)</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="operatingHours.openTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Open Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="time"
                        {...field}
                        data-testid="input-open-time"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="operatingHours.closeTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Close Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="time"
                        {...field}
                        data-testid="input-close-time"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="operatingHours.daysOpen"
              render={() => (
                <FormItem>
                  <FormLabel className="text-white">Days Open</FormLabel>
                  <div className="grid grid-cols-4 gap-3">
                    {daysOfWeek.map((day) => (
                      <FormField
                        key={day}
                        control={form.control}
                        name="operatingHours.daysOpen"
                        render={({ field }) => (
                          <FormItem key={day} className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                data-testid={`checkbox-day-${day.toLowerCase()}`}
                                checked={field.value?.includes(day)}
                                onCheckedChange={(checked) => {
                                  const currentValues = field.value || [];
                                  if (checked) {
                                    field.onChange([...currentValues, day]);
                                  } else {
                                    field.onChange(currentValues.filter((value) => value !== day));
                                  }
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm text-white">
                              {day.slice(0, 3)}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-complete-restaurant-info"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {isLoading ? "Saving..." : "Continue"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function DepartmentsStep({ data, onComplete, isLoading }: {
  data?: z.infer<typeof departmentsSchema>;
  onComplete: (data: any) => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof departmentsSchema>>({
    resolver: zodResolver(departmentsSchema),
    defaultValues: {
      departments: data?.departments || [
        { name: "Kitchen", description: "Food preparation and cooking", budget: "" },
        { name: "Front of House", description: "Customer service and dining", budget: "" }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "departments"
  });

  const onSubmit = (values: z.infer<typeof departmentsSchema>) => {
    onComplete(values);
  };

  const commonDepartments = [
    { name: "Kitchen", description: "Food preparation and cooking", icon: ChefHat },
    { name: "Front of House", description: "Customer service and dining area", icon: Utensils },
    { name: "Bar", description: "Beverage service and bar operations", icon: Wine },
    { name: "Management", description: "Administrative and oversight duties", icon: Users2 },
    { name: "Maintenance", description: "Facility upkeep and repairs", icon: Settings }
  ];

  const addCommonDepartment = (dept: typeof commonDepartments[0]) => {
    const exists = fields.some(field => field.name === dept.name);
    if (!exists) {
      append({ name: dept.name, description: dept.description, budget: "" });
    }
  };

  return (
    <div data-testid="step-departments" className="space-y-6">
      <Alert className="bg-blue-900/20 border-blue-600">
        <Users2 className="h-4 w-4" />
        <AlertDescription className="text-blue-100">
          Set up your restaurant departments to organize your team and operations. You can always modify these later.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Your Departments</h3>
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ name: "", description: "", budget: "" })}
                data-testid="button-add-department"
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                Add Department
              </Button>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="bg-slate-700 border-slate-600">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name={`departments.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white">Department Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Kitchen, Bar" 
                              {...field}
                              data-testid={`input-department-name-${index}`}
                              className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`departments.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white">Description</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Brief description" 
                              {...field}
                              data-testid={`input-department-description-${index}`}
                              className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-end gap-2">
                      <FormField
                        control={form.control}
                        name={`departments.${index}.budget`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="text-white">Monthly Budget</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                placeholder="5000" 
                                {...field}
                                data-testid={`input-department-budget-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => remove(index)}
                          data-testid={`button-remove-department-${index}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator className="bg-slate-600" />

          <div className="space-y-4">
            <h4 className="font-medium text-white">Quick Add Common Departments</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {commonDepartments.map((dept, index) => {
                const exists = fields.some(field => field.name === dept.name);
                return (
                  <Button
                    key={dept.name}
                    type="button"
                    variant="outline"
                    disabled={exists}
                    onClick={() => addCommonDepartment(dept)}
                    data-testid={`button-add-common-department-${index}`}
                    className={`bg-slate-700 border-slate-600 text-white hover:bg-slate-600 justify-start ${
                      exists ? 'opacity-50' : ''
                    }`}
                  >
                    <dept.icon className="w-4 h-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">{dept.name}</div>
                      <div className="text-xs text-slate-400">{dept.description}</div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-complete-departments"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {isLoading ? "Saving..." : "Continue"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function PositionsStep({ data, departmentsData, onComplete, isLoading }: {
  data?: z.infer<typeof positionsSchema>;
  departmentsData?: z.infer<typeof departmentsSchema>;
  onComplete: (data: any) => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof positionsSchema>>({
    resolver: zodResolver(positionsSchema),
    defaultValues: {
      positions: data?.positions || [
        { title: "Manager", departmentId: "", description: "Oversee daily operations", minHourlyRate: "", maxHourlyRate: "", requirements: "" },
        { title: "Server", departmentId: "", description: "Provide excellent customer service", minHourlyRate: "", maxHourlyRate: "", requirements: "" }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "positions"
  });

  const onSubmit = (values: z.infer<typeof positionsSchema>) => {
    onComplete(values);
  };

  const commonPositions = [
    { title: "General Manager", description: "Overall restaurant operations", type: "management" },
    { title: "Kitchen Manager", description: "Oversee kitchen operations", type: "kitchen" },
    { title: "Head Chef", description: "Lead kitchen staff and menu creation", type: "kitchen" },
    { title: "Line Cook", description: "Prepare food according to recipes", type: "kitchen" },
    { title: "Server", description: "Take orders and serve customers", type: "front" },
    { title: "Host/Hostess", description: "Welcome guests and manage seating", type: "front" },
    { title: "Bartender", description: "Prepare and serve beverages", type: "bar" },
    { title: "Busser", description: "Clear and clean tables", type: "front" },
    { title: "Dishwasher", description: "Clean dishes and kitchen equipment", type: "kitchen" }
  ];

  const addCommonPosition = (pos: typeof commonPositions[0]) => {
    const exists = fields.some(field => field.title === pos.title);
    if (!exists) {
      append({ 
        title: pos.title, 
        departmentId: "", 
        description: pos.description, 
        minHourlyRate: "", 
        maxHourlyRate: "", 
        requirements: "" 
      });
    }
  };

  const departments = departmentsData?.departments || [];

  return (
    <div data-testid="step-positions" className="space-y-6">
      <Alert className="bg-green-900/20 border-green-600">
        <UserCheck className="h-4 w-4" />
        <AlertDescription className="text-green-100">
          Define the job positions for your restaurant. These will be used for hiring and employee management.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Staff Positions</h3>
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ title: "", departmentId: "", description: "", minHourlyRate: "", maxHourlyRate: "", requirements: "" })}
                data-testid="button-add-position"
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                Add Position
              </Button>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="bg-slate-700 border-slate-600">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`positions.${index}.title`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Position Title *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., Server, Cook" 
                                {...field}
                                data-testid={`input-position-title-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`positions.${index}.departmentId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Department *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`select-position-department-${index}`} className="bg-slate-600 border-slate-500 text-white">
                                  <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {departments.map((dept, deptIndex) => (
                                  <SelectItem key={deptIndex} value={deptIndex.toString()}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`positions.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white">Job Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe the role and responsibilities" 
                              {...field}
                              data-testid={`input-position-description-${index}`}
                              className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`positions.${index}.minHourlyRate`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Min Hourly Rate ($)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                step="0.01"
                                placeholder="15.00" 
                                {...field}
                                data-testid={`input-position-min-rate-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`positions.${index}.maxHourlyRate`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Max Hourly Rate ($)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                step="0.01"
                                placeholder="25.00" 
                                {...field}
                                data-testid={`input-position-max-rate-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <FormField
                        control={form.control}
                        name={`positions.${index}.requirements`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="text-white">Requirements</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., 2+ years experience, food safety cert" 
                                {...field}
                                data-testid={`input-position-requirements-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => remove(index)}
                          data-testid={`button-remove-position-${index}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator className="bg-slate-600" />

          <div className="space-y-4">
            <h4 className="font-medium text-white">Quick Add Common Positions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {commonPositions.map((pos, index) => {
                const exists = fields.some(field => field.title === pos.title);
                return (
                  <Button
                    key={pos.title}
                    type="button"
                    variant="outline"
                    disabled={exists}
                    onClick={() => addCommonPosition(pos)}
                    data-testid={`button-add-common-position-${index}`}
                    className={`bg-slate-700 border-slate-600 text-white hover:bg-slate-600 justify-start ${
                      exists ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="text-left">
                      <div className="font-medium">{pos.title}</div>
                      <div className="text-xs text-slate-400">{pos.description}</div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-complete-positions"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {isLoading ? "Saving..." : "Continue"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function HRAddonStep({ data, onComplete, onSkip, isLoading }: {
  data?: z.infer<typeof hrAddonSchema>;
  onComplete: (data: any) => void;
  onSkip: () => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof hrAddonSchema>>({
    resolver: zodResolver(hrAddonSchema),
    defaultValues: {
      enableHR: data?.enableHR || false,
      selectedFeatures: data?.selectedFeatures || [],
      enableForLocations: data?.enableForLocations || []
    }
  });

  const watchEnableHR = form.watch("enableHR");

  const { data: locationsData } = useQuery<any[]>({
    queryKey: ['/api/locations'],
    enabled: watchEnableHR,
  });
  const availableLocations = (locationsData || []).map((loc: any) => ({ id: loc.id, name: loc.name }));

  const onSubmit = (values: z.infer<typeof hrAddonSchema>) => {
    onComplete(values);
  };

  const hrFeatures = [
    {
      id: "payroll",
      name: "Payroll Management",
      description: "Automated payroll processing and tax calculations",
      icon: Settings,
      recommended: true
    },
    {
      id: "scheduling",
      name: "Employee Scheduling",
      description: "Create and manage employee schedules",
      icon: Clock,
      recommended: true
    },
    {
      id: "time_tracking",
      name: "Time & Attendance",
      description: "Clock in/out and attendance tracking",
      icon: Clock,
      recommended: true
    },
    {
      id: "performance",
      name: "Performance Reviews",
      description: "Employee performance tracking and reviews",
      icon: Star,
      recommended: false
    },
    {
      id: "benefits",
      name: "Benefits Administration",
      description: "Manage employee benefits and enrollment",
      icon: UserCheck,
      recommended: false
    }
  ];

  return (
    <div data-testid="step-hr-addon" className="space-y-6">
      <Alert className="bg-purple-900/20 border-purple-600">
        <Settings className="h-4 w-4" />
        <AlertDescription className="text-purple-100">
          Enable HR features to streamline employee management. This step is optional - you can enable these features later.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-6">
            <FormField
              control={form.control}
              name="enableHR"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-slate-600 p-4 bg-slate-700">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base text-white">
                      Enable HR Management Features
                    </FormLabel>
                    <FormDescription className="text-slate-300">
                      Add advanced employee management capabilities to your restaurant
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Checkbox
                      data-testid="checkbox-enable-hr"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {watchEnableHR && (
              <>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Select HR Features</h3>
                  <div className="grid gap-4">
                    {hrFeatures.map((feature) => (
                      <FormField
                        key={feature.id}
                        control={form.control}
                        name="selectedFeatures"
                        render={({ field }) => (
                          <FormItem
                            key={feature.id}
                            className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-slate-600 p-4 bg-slate-700"
                          >
                            <FormControl>
                              <Checkbox
                                data-testid={`checkbox-feature-${feature.id}`}
                                checked={field.value?.includes(feature.id)}
                                onCheckedChange={(checked) => {
                                  const currentValues = field.value || [];
                                  if (checked) {
                                    field.onChange([...currentValues, feature.id]);
                                  } else {
                                    field.onChange(currentValues.filter((value) => value !== feature.id));
                                  }
                                }}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none flex-1">
                              <div className="flex items-center gap-2">
                                <feature.icon className="w-4 h-4 text-white" />
                                <FormLabel className="text-white font-medium">
                                  {feature.name}
                                </FormLabel>
                                {feature.recommended && (
                                  <Badge variant="secondary" className="text-xs">
                                    Recommended
                                  </Badge>
                                )}
                              </div>
                              <FormDescription className="text-slate-300">
                                {feature.description}
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Enable for Locations</h3>
                  <FormField
                    control={form.control}
                    name="enableForLocations"
                    render={() => (
                      <FormItem>
                        <FormDescription className="text-slate-300">
                          Select which locations should have HR features enabled
                        </FormDescription>
                        <div className="grid gap-3">
                          {availableLocations.map((location) => (
                            <FormField
                              key={location.id}
                              control={form.control}
                              name="enableForLocations"
                              render={({ field }) => (
                                <FormItem
                                  key={location.id}
                                  className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-slate-600 p-3 bg-slate-700"
                                >
                                  <FormControl>
                                    <Checkbox
                                      data-testid={`checkbox-location-${location.id}`}
                                      checked={field.value?.includes(location.id)}
                                      onCheckedChange={(checked) => {
                                        const currentValues = field.value || [];
                                        if (checked) {
                                          field.onChange([...currentValues, location.id]);
                                        } else {
                                          field.onChange(currentValues.filter((value) => value !== location.id));
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-white font-medium">
                                      {location.name}
                                    </FormLabel>
                                  </div>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onSkip}
              disabled={isLoading}
              data-testid="button-skip-hr-addon"
              className="text-slate-400 hover:text-white"
            >
              Skip for Now
            </Button>
            
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-complete-hr-addon"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {isLoading ? "Saving..." : "Continue"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function EmployeeInvitationsStep({ data, departmentsData, positionsData, onComplete, onSkip, isLoading }: {
  data?: z.infer<typeof employeeInvitationsSchema>;
  departmentsData?: z.infer<typeof departmentsSchema>;
  positionsData?: z.infer<typeof positionsSchema>;
  onComplete: (data: any) => void;
  onSkip: () => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof employeeInvitationsSchema>>({
    resolver: zodResolver(employeeInvitationsSchema),
    defaultValues: {
      invitations: data?.invitations || [
        { firstName: "", lastName: "", email: "", positionId: "", departmentId: "", hourlyRate: "" }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "invitations"
  });

  const onSubmit = (values: z.infer<typeof employeeInvitationsSchema>) => {
    onComplete(values);
  };

  const departments = departmentsData?.departments || [];
  const positions = positionsData?.positions || [];

  return (
    <div data-testid="step-employee-invitations" className="space-y-6">
      <Alert className="bg-orange-900/20 border-orange-600">
        <Mail className="h-4 w-4" />
        <AlertDescription className="text-orange-100">
          Invite your initial team members to join your restaurant. They'll receive email invitations to set up their accounts. You can skip this step and invite employees later.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Team Invitations</h3>
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ firstName: "", lastName: "", email: "", positionId: "", departmentId: "", hourlyRate: "" })}
                data-testid="button-add-invitation"
                className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
              >
                Add Team Member
              </Button>
            </div>

            {fields.map((field, index) => (
              <Card key={field.id} className="bg-slate-700 border-slate-600">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`invitations.${index}.firstName`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">First Name *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="John" 
                                {...field}
                                data-testid={`input-invitation-firstname-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`invitations.${index}.lastName`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Last Name *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Smith" 
                                {...field}
                                data-testid={`input-invitation-lastname-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`invitations.${index}.email`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Email *</FormLabel>
                            <FormControl>
                              <Input 
                                type="email"
                                placeholder="john.smith@email.com" 
                                {...field}
                                data-testid={`input-invitation-email-${index}`}
                                className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`invitations.${index}.departmentId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Department *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`select-invitation-department-${index}`} className="bg-slate-600 border-slate-500 text-white">
                                  <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {departments.map((dept, deptIndex) => (
                                  <SelectItem key={deptIndex} value={deptIndex.toString()}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`invitations.${index}.positionId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white">Position *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`select-invitation-position-${index}`} className="bg-slate-600 border-slate-500 text-white">
                                  <SelectValue placeholder="Select position" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {positions.map((pos, posIndex) => (
                                  <SelectItem key={posIndex} value={posIndex.toString()}>
                                    {pos.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-end gap-2">
                        <FormField
                          control={form.control}
                          name={`invitations.${index}.hourlyRate`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-white">Hourly Rate ($)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01"
                                  placeholder="18.00" 
                                  {...field}
                                  data-testid={`input-invitation-rate-${index}`}
                                  className="bg-slate-600 border-slate-500 text-white placeholder:text-slate-400"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => remove(index)}
                            data-testid={`button-remove-invitation-${index}`}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-white font-medium">What happens next?</h4>
                <p className="text-slate-300 text-sm mt-1">
                  Each team member will receive an email invitation with instructions to:
                </p>
                <ul className="list-disc list-inside text-slate-300 text-sm mt-2 space-y-1">
                  <li>Create their account and set their password</li>
                  <li>Complete their employee profile</li>
                  <li>Access the RestroFlow employee portal</li>
                  <li>View their schedule and manage time tracking</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onSkip}
              disabled={isLoading}
              data-testid="button-skip-invitations"
              className="text-slate-400 hover:text-white"
            >
              Skip for Now
            </Button>
            
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-complete-invitations"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {isLoading ? "Sending Invitations..." : "Complete Setup"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}