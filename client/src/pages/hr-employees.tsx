import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users, UserPlus, Search, Filter, Mail, Phone, MapPin, User, Edit, Trash2, MoreVertical, UserX, Ban } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions, Permission } from "@/contexts/PermissionContext";
import { useLocation } from "wouter";
import { useLocation as useLocationContext } from "@/contexts/LocationContext";
import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status: 'active' | 'inactive' | 'terminated';
  hireDate: string;
  department?: { name: string };
  position?: { title: string };
  hourlyRate?: number;
  profilePhoto?: string;
}

export default function HREmployees() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, userRole, canManageUser } = usePermissions();
  const [, setLocation] = useLocation();
  const { currentLocation, hasHRAccess } = useLocationContext();

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: departments = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/hr/departments', currentLocation?.id],
    queryFn: async () => {
      const response = await fetch(`/api/hr/departments?locationId=${currentLocation?.id}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch departments');
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const { data: positions = [] } = useQuery<Array<{ id: string; title: string }>>({
    queryKey: ['/api/hr/positions', currentLocation?.id],
    queryFn: async () => {
      const response = await fetch(`/api/hr/positions?locationId=${currentLocation?.id}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch positions');
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (employeeData: any) => {
      return await apiRequest('POST', '/api/hr/employees', employeeData);
    },
    onSuccess: (data: any) => {
      if (data.warning) {
        toast({ 
          title: "Employee Created", 
          description: data.warning,
          variant: "destructive"
        });
      } else {
        toast({ 
          title: "Success", 
          description: "Employee and login account created successfully" 
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/hr/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/employees', currentLocation?.id] });
      setIsDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create employee", variant: "destructive" });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest('PUT', `/api/hr/employees/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Employee updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/employees'] });
      setIsDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update employee", variant: "destructive" });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/hr/employees/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Employee deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/employees'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete employee", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'inactive' | 'terminated' }) => {
      return await apiRequest('PUT', `/api/hr/employees/${id}`, { status });
    },
    onSuccess: (_, variables) => {
      const statusLabels = { active: 'Active', inactive: 'Inactive', terminated: 'Terminated' };
      toast({ title: "Success", description: `Employee marked as ${statusLabels[variables.status]}` });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/analytics'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update employee status", variant: "destructive" });
    },
  });

  const filteredEmployees = employees.filter((employee: Employee) => {
    const matchesSearch = searchTerm === "" ||
      employee.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || employee.status === statusFilter;
    const matchesDepartment = departmentFilter === "all" || 
      employee.department?.name?.toLowerCase() === departmentFilter.toLowerCase();
    
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const employeeData = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      departmentId: formData.get('departmentId') === 'none' ? null : formData.get('departmentId'),
      positionId: formData.get('positionId') === 'none' ? null : formData.get('positionId'),
      hourlyRate: formData.get('hourlyRate') ? parseFloat(formData.get('hourlyRate') as string) : null,
      hireDate: formData.get('hireDate') as string || new Date().toISOString().split('T')[0],
      status: formData.get('status') || 'active',
      notes: formData.get('notes'),
    };

    if (editingEmployee) {
      updateEmployeeMutation.mutate({ id: editingEmployee.id, data: employeeData });
    } else {
      createEmployeeMutation.mutate(employeeData);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'inactive': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'terminated': return 'bg-red-900/30 text-red-400 border border-red-800';
      default: return 'bg-accent text-foreground';
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Show upgrade prompt if HR access is not enabled for this location
  if (!hasHRAccess) {
    return <HRUpgradePrompt locationName={currentLocation?.name || 'this location'} />;
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 overflow-y-auto max-h-screen">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Employee Directory
            </h1>
            <p className="text-muted-foreground">Manage your restaurant team</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingEmployee(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[95vh] flex flex-col p-0">
              <form onSubmit={handleSubmit} className="flex flex-col h-full">
                <div className="p-6 border-b">
                  <DialogHeader>
                    <DialogTitle>
                      {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                    </DialogTitle>
                    <DialogDescription>
                      {editingEmployee ? 'Update employee information' : 'Enter employee details to add them to your team'}
                    </DialogDescription>
                  </DialogHeader>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      defaultValue={editingEmployee?.firstName || ''}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      defaultValue={editingEmployee?.lastName || ''}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={editingEmployee?.email || ''}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      defaultValue={editingEmployee?.phone || ''}
                    />
                  </div>
                  
                  {!editingEmployee && (
                    <div className="rounded-lg bg-blue-900/20 border border-blue-700/50 p-3">
                      <p className="text-sm text-blue-300">
                        A one-time activation link will be emailed to the employee. They'll use it to sign in and set their own password — no temporary password is created.
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="departmentId">Department</Label>
                    <Select name="departmentId" defaultValue={editingEmployee?.department?.name || ''}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Department</SelectItem>
                        {departments.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="positionId">Position</Label>
                    <Select name="positionId" defaultValue={editingEmployee?.position?.title || ''}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Position</SelectItem>
                        {positions.map((pos: any) => (
                          <SelectItem key={pos.id} value={pos.id}>
                            {pos.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                    <Input
                      id="hourlyRate"
                      name="hourlyRate"
                      type="number"
                      step="0.01"
                      defaultValue={editingEmployee?.hourlyRate || ''}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="hireDate">Hire Date</Label>
                    <Input
                      id="hireDate"
                      name="hireDate"
                      type="date"
                      defaultValue={editingEmployee?.hireDate ? new Date(editingEmployee.hireDate).toISOString().split('T')[0] : ''}
                    />
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="status">Status</Label>
                    <Select name="status" defaultValue={editingEmployee?.status || 'active'}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      placeholder="Additional notes about the employee..."
                      rows={3}
                    />
                  </div>
                </div>
                </div>
                
                <div className="p-6 border-t border-slate-700 bg-slate-800">
                  <DialogFooter>
                    <Button type="submit" disabled={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}>
                      {editingEmployee ? 'Update Employee' : 'Add Employee'}
                    </Button>
                  </DialogFooter>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mt-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Employee Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.map((employee: Employee) => (
          <Card key={employee.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={employee.profilePhoto} />
                    <AvatarFallback>{getInitials(employee.firstName, employee.lastName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg">{employee.firstName} {employee.lastName}</CardTitle>
                      <Badge variant="outline" className="text-xs font-mono">
                        {employee.employeeNumber}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{employee.position?.title || 'No position assigned'}</p>
                  </div>
                </div>
                <Badge className={getStatusColor(employee.status)}>
                  {employee.status}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {employee.email}
                </div>
                {employee.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {employee.phone}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {employee.department?.name || 'No department'}
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-sm">
                  <span className="text-muted-foreground">Hire Date:</span>
                  <br />
                  <span className="font-medium">{new Date(employee.hireDate).toLocaleDateString()}</span>
                </div>
                {employee.hourlyRate && (
                  <div className="text-right text-sm">
                    <span className="text-muted-foreground">Rate:</span>
                    <br />
                    <span className="font-medium">${employee.hourlyRate}/hr</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setLocation(`/employees/${employee.id}`)}
                  data-testid={`view-employee-${employee.id}`}
                >
                  <User className="w-4 h-4 mr-2" />
                  View Profile
                </Button>
                
                {hasPermission(Permission.MANAGE_EMPLOYEES) && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setEditingEmployee(employee);
                        setIsDialogOpen(true);
                      }}
                      data-testid={`edit-employee-${employee.id}`}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`actions-menu-${employee.id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {employee.status !== 'inactive' && (
                          <DropdownMenuItem
                            onClick={() => updateStatusMutation.mutate({ id: employee.id, status: 'inactive' })}
                            data-testid={`mark-inactive-${employee.id}`}
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Mark Inactive
                          </DropdownMenuItem>
                        )}
                        {employee.status !== 'terminated' && (
                          <DropdownMenuItem
                            onClick={() => updateStatusMutation.mutate({ id: employee.id, status: 'terminated' })}
                            data-testid={`mark-terminated-${employee.id}`}
                          >
                            <UserX className="w-4 h-4 mr-2" />
                            Mark Terminated
                          </DropdownMenuItem>
                        )}
                        {employee.status !== 'active' && (
                          <DropdownMenuItem
                            onClick={() => updateStatusMutation.mutate({ id: employee.id, status: 'active' })}
                            data-testid={`mark-active-${employee.id}`}
                          >
                            <User className="w-4 h-4 mr-2" />
                            Mark Active
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete ${employee.firstName} ${employee.lastName}? This action cannot be undone.`)) {
                              deleteEmployeeMutation.mutate(employee.id);
                            }
                          }}
                          data-testid={`delete-employee-${employee.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredEmployees.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No employees found</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || statusFilter !== "all" 
              ? "Try adjusting your search or filters"
              : "Get started by adding your first employee"
            }
          </p>
          {!searchTerm && statusFilter === "all" && (
            <Button onClick={() => setIsDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add First Employee
            </Button>
          )}
        </div>
      )}
    </div>
  );
}