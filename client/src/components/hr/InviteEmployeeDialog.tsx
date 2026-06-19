import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { UserPlus, Mail, Clock, MapPin, Users, Briefcase } from 'lucide-react';
import type { Location, Department, Position } from '@shared/schema';

// Invitation form schema
const inviteEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  role: z.enum(['owner', 'manager', 'team_lead', 'employee'], {
    required_error: 'Role is required',
  }),
  locationId: z.string().min(1, 'Location is required'),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  startDate: z.string().optional(),
  hourlyRate: z.string().optional(),
  salary: z.string().optional(),
  personalMessage: z.string().optional(),
});

type InviteEmployeeFormData = z.infer<typeof inviteEmployeeSchema>;

interface InviteEmployeeDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function InviteEmployeeDialog({ 
  trigger, 
  open, 
  onOpenChange 
}: InviteEmployeeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Control dialog state
  const dialogOpen = open !== undefined ? open : isOpen;
  const setDialogOpen = onOpenChange || setIsOpen;

  // Fetch required data
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const form = useForm<InviteEmployeeFormData>({
    resolver: zodResolver(inviteEmployeeSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      role: 'employee',
      locationId: '',
      departmentId: '',
      positionId: '',
      startDate: '',
      hourlyRate: '',
      salary: '',
      personalMessage: '',
    },
  });

  const inviteEmployeeMutation = useMutation({
    mutationFn: async (data: InviteEmployeeFormData) => {
      // Convert string values to appropriate types
      const payload = {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
        salary: data.salary ? parseFloat(data.salary) : undefined,
        departmentId: data.departmentId || undefined,
        positionId: data.positionId || undefined,
      };
      
      const res = await apiRequest('POST', '/api/invitations', payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.emailSent) {
        toast({
          title: 'Invitation Sent!',
          description: 'Employee invitation has been sent via email.',
        });
      } else {
        toast({
          title: 'Invitation Created',
          description: data?.invitationUrl
            ? `Email not configured. Share this link: ${data.invitationUrl}`
            : 'Invitation created. Configure RESEND_API_KEY to send emails.',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
      form.reset();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Send Invitation',
        description: error.message || 'There was an error sending the invitation. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: InviteEmployeeFormData) => {
    inviteEmployeeMutation.mutate(data);
  };

  // Watch selected location to fetch departments and positions
  const selectedLocationId = form.watch('locationId');

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/hr/departments', selectedLocationId],
    queryFn: async () => {
      const response = await fetch(`/api/hr/departments?locationId=${selectedLocationId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch departments');
      return response.json();
    },
    enabled: !!selectedLocationId,
  });

  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ['/api/hr/positions', selectedLocationId],
    queryFn: async () => {
      const response = await fetch(`/api/hr/positions?locationId=${selectedLocationId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch positions');
      return response.json();
    },
    enabled: !!selectedLocationId,
  });

  const roleDescriptions = {
    owner: 'Full access to all system features and business management',
    manager: 'Manage teams, view reports, and oversee daily operations',
    team_lead: 'Lead a team and manage specific department operations',
    employee: 'Access to assigned tasks and basic features',
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite New Employee
          </DialogTitle>
          <DialogDescription>
            Send an invitation email to a new team member. They'll receive a secure link to create their account and join your restaurant.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Employee Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="John" 
                          {...field}
                          data-testid="input-firstName"
                        />
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
                        <Input 
                          placeholder="Doe" 
                          {...field}
                          data-testid="input-lastName"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="john.doe@restaurant.com" 
                        {...field}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormDescription>
                      They'll receive an invitation email at this address
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Role & Access */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Role & Permissions
              </h3>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder="Select role..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="team_lead">Team Lead</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value && roleDescriptions[field.value as keyof typeof roleDescriptions]}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Location & Department */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Location & Department
              </h3>

              <FormField
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Restaurant Location</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-location">
                          <SelectValue placeholder="Select location..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name} - {location.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-department">
                            <SelectValue placeholder="Select department..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem key={department.id} value={department.id}>
                              {department.name}
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
                  name="positionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-position">
                            <SelectValue placeholder="Select position..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {positions.map((position) => (
                            <SelectItem key={position.id} value={position.id}>
                              {position.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Employment Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Employment Details (Optional)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field}
                          data-testid="input-startDate"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hourly Rate ($)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="15.00" 
                          {...field}
                          data-testid="input-hourlyRate"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual Salary ($)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="45000" 
                          {...field}
                          data-testid="input-salary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Personal Message */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Personal Touch
              </h3>

              <FormField
                control={form.control}
                name="personalMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Message (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Welcome to the team! We're excited to have you join us..."
                        className="min-h-[80px]"
                        {...field}
                        data-testid="input-personalMessage"
                      />
                    </FormControl>
                    <FormDescription>
                      Add a personal welcome message that will be included in the invitation email
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setDialogOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={inviteEmployeeMutation.isPending}
                data-testid="button-send-invitation"
              >
                {inviteEmployeeMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Sending Invitation...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}