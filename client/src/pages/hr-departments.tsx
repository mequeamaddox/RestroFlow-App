import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building, Users, Plus, Search, Edit, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions, Permission } from "@/contexts/PermissionContext";
import { useLocation } from "@/contexts/LocationContext";

interface Department {
  id: string;
  name: string;
  description?: string;
  locationId?: string;
  managerId?: string;
  employeeCount?: number;
}

export default function HRDepartments() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const { currentLocation, hasHRAccess } = useLocation();

  const { data: departments = [], isLoading } = useQuery<Department[]>({
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

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    queryFn: async () => {
      const response = await fetch(`/api/hr/employees?locationId=${currentLocation?.id}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch employees');
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (departmentData: any) => {
      return await apiRequest('POST', '/api/hr/departments', departmentData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Department created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/departments', currentLocation?.id] });
      setIsCreateDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create department", variant: "destructive" });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest('PUT', `/api/hr/departments/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Department updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/departments', currentLocation?.id] });
      setEditingDepartment(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update department", variant: "destructive" });
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/hr/departments/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Department deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/departments', currentLocation?.id] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete department", variant: "destructive" });
    },
  });

  const filteredDepartments = departments.filter((dept: Department) =>
    dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dept.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const departmentData = {
      name: formData.get('name'),
      description: formData.get('description'),
      locationId: currentLocation?.id || null,
      managerId: formData.get('managerId') === 'none' ? null : formData.get('managerId'),
    };

    if (editingDepartment) {
      updateDepartmentMutation.mutate({ id: editingDepartment.id, data: departmentData });
    } else {
      createDepartmentMutation.mutate(departmentData);
    }
  };

  const canManage = hasPermission(Permission.MANAGE_EMPLOYEES);

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Departments</h1>
        <p className="text-muted-foreground">Organize your team by departments and locations</p>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search departments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-departments"
          />
        </div>
        
        {canManage && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-department">
                <Plus className="h-4 w-4 mr-2" />
                Add Department
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Department</DialogTitle>
                <DialogDescription>
                  Add a new department to organize your team structure.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Department Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="e.g., Kitchen, Front of House"
                      required
                      data-testid="input-department-name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="Brief description of the department"
                      data-testid="input-department-description"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="managerId">Department Manager</Label>
                    <select
                      id="managerId"
                      name="managerId"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="select-department-manager"
                    >
                      <option value="none">No manager assigned</option>
                      {employees.map((employee: any) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createDepartmentMutation.isPending} data-testid="button-save-department">
                    {createDepartmentMutation.isPending ? 'Creating...' : 'Create Department'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Departments Grid */}
      {isLoading ? (
        <div className="text-center py-12">Loading departments...</div>
      ) : filteredDepartments.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Building className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No departments found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? 'No departments match your search.' : 'Get started by creating your first department.'}
            </p>
            {canManage && !searchTerm && (
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-department">
                <Plus className="h-4 w-4 mr-2" />
                Create First Department
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDepartments.map((department: Department) => (
            <Card key={department.id} className="hover:shadow-lg transition-shadow" data-testid={`card-department-${department.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    <span>{department.name}</span>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingDepartment(department)}
                        data-testid={`button-edit-department-${department.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteDepartmentMutation.mutate(department.id)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`button-delete-department-${department.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardTitle>
                {department.description && (
                  <CardDescription>{department.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span data-testid={`text-employee-count-${department.id}`}>
                    {employees.filter((emp: any) => emp.departmentId === department.id).length} employees
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingDepartment} onOpenChange={() => setEditingDepartment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>
              Update department information and settings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Department Name</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={editingDepartment?.name}
                  required
                  data-testid="input-edit-department-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  name="description"
                  defaultValue={editingDepartment?.description}
                  data-testid="input-edit-department-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateDepartmentMutation.isPending} data-testid="button-update-department">
                {updateDepartmentMutation.isPending ? 'Updating...' : 'Update Department'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}