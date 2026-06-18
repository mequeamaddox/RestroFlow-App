import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
import { useLocation } from "@/contexts/LocationContext";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Plus, Check, X, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const timeOffFormSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  requestType: z.enum(["vacation", "sick", "personal", "emergency"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  totalHours: z.number().min(0.5, "Must be at least 0.5 hours"),
  reason: z.string().min(1, "Reason is required"),
});

type TimeOffFormData = z.infer<typeof timeOffFormSchema>;

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position?: { title: string };
  department?: { name: string };
}

interface TimeOffRequest {
  id: string;
  employeeId: string;
  requestType: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvalDate?: string;
  notes?: string;
  createdAt: string;
  employee?: Employee;
}

export default function HRTimeOff() {
  const { currentLocation, hasHRAccess } = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees'],
  });

  const { data: timeOffRequests = [], isLoading: requestsLoading } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/hr/time-off-requests'],
  });

  const form = useForm<TimeOffFormData>({
    resolver: zodResolver(timeOffFormSchema),
    defaultValues: {
      employeeId: "",
      requestType: "vacation",
      startDate: "",
      endDate: "",
      totalHours: 8,
      reason: "",
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: TimeOffFormData) => {
      return await apiRequest('POST', '/api/hr/time-off-requests', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Time-off request created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-off-requests'] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create time-off request", variant: "destructive" });
    },
  });

  const updateRequestStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return await apiRequest('PUT', `/api/hr/time-off-requests/${id}/status`, { status, notes });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Request status updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-off-requests'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update request status", variant: "destructive" });
    },
  });

  const onSubmit = (data: TimeOffFormData) => {
    createRequestMutation.mutate(data);
  };

  const calculateWorkingDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    const current = new Date(start);
    
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'approved':
        return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'rejected':
        return 'bg-red-900/30 text-red-400 border border-red-800';
      default:
        return 'bg-accent text-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <AlertCircle className="h-3 w-3" />;
      case 'approved':
        return <Check className="h-3 w-3" />;
      case 'rejected':
        return <X className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const filteredRequests = statusFilter === "all" 
    ? timeOffRequests 
    : timeOffRequests.filter(request => request.status === statusFilter);

  if (employeesLoading || requestsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time-Off Management</h1>
          <p className="text-muted-foreground">Manage employee time-off requests and approvals</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Time-Off Request</DialogTitle>
              <DialogDescription>
                Submit a new time-off request for an employee
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.firstName} {employee.lastName} - {employee.position?.title}
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
                  name="requestType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Request Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vacation">Vacation</SelectItem>
                          <SelectItem value="sick">Sick Leave</SelectItem>
                          <SelectItem value="personal">Personal Leave</SelectItem>
                          <SelectItem value="emergency">Emergency Leave</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="totalHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Hours</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.5"
                          min="0.5" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Please provide a reason for the time-off request"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createRequestMutation.isPending}>
                    Submit Request
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{timeOffRequests.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {timeOffRequests.filter(r => r.status === 'pending').length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">
                  {timeOffRequests.filter(r => r.status === 'approved').length}
                </p>
              </div>
              <Check className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">
                  {timeOffRequests.filter(r => r.status === 'rejected').length}
                </p>
              </div>
              <X className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Time-Off Requests</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No time-off requests found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRequests.map((request) => {
                const employee = employees.find(emp => emp.id === request.employeeId);
                const workingDays = calculateWorkingDays(request.startDate, request.endDate);
                
                return (
                  <div key={request.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium">
                            {employee?.firstName} {employee?.lastName}
                          </h3>
                          <Badge className={getStatusColor(request.status)}>
                            {getStatusIcon(request.status)}
                            <span className="ml-1 capitalize">{request.status}</span>
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {request.requestType}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Dates:</span>
                            <p>{new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <span className="font-medium">Duration:</span>
                            <p>{workingDays} days ({request.totalHours}h)</p>
                          </div>
                          <div>
                            <span className="font-medium">Position:</span>
                            <p>{employee?.position?.title}</p>
                          </div>
                          <div>
                            <span className="font-medium">Requested:</span>
                            <p>{new Date(request.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <span className="font-medium text-sm">Reason:</span>
                          <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                        </div>
                        {request.notes && (
                          <div className="mt-2">
                            <span className="font-medium text-sm">Manager Notes:</span>
                            <p className="text-sm text-muted-foreground mt-1">{request.notes}</p>
                          </div>
                        )}
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-400 border-green-700 hover:bg-green-900/20"
                            onClick={() => updateRequestStatusMutation.mutate({ 
                              id: request.id, 
                              status: 'approved' 
                            })}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-400 border-red-700 hover:bg-red-900/20"
                            onClick={() => updateRequestStatusMutation.mutate({ 
                              id: request.id, 
                              status: 'rejected' 
                            })}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}