import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, Users, Plus, Search, Edit, Trash2, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions, Permission } from "@/contexts/PermissionContext";
import { useLocation } from "@/contexts/LocationContext";

interface Position {
  id: string;
  title: string;
  description?: string;
  hourlyRate?: number;
  departmentId?: string;
  department?: { name: string };
  employeeCount?: number;
}

export default function HRPositions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const { currentLocation, hasHRAccess } = useLocation();

  const { data: positions = [], isLoading } = useQuery<Position[]>({
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

  const { data: departments = [] } = useQuery<any[]>({
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
    queryKey: ['/api/hr/employees'],
  });

  const createPositionMutation = useMutation({
    mutationFn: async (positionData: any) => {
      return await apiRequest('POST', `/api/hr/positions?locationId=${currentLocation?.id}`, positionData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Position created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/positions', currentLocation?.id] });
      setIsCreateDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create position", variant: "destructive" });
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest('PUT', `/api/hr/positions/${id}?locationId=${currentLocation?.id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Position updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/positions', currentLocation?.id] });
      setEditingPosition(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update position", variant: "destructive" });
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/hr/positions/${id}?locationId=${currentLocation?.id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Position deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/positions', currentLocation?.id] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete position", variant: "destructive" });
    },
  });

  const filteredPositions = positions.filter((position: Position) =>
    position.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    position.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    position.department?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const positionData = {
      title: formData.get('title'),
      description: formData.get('description'),
      hourlyRate: formData.get('hourlyRate') ? parseFloat(formData.get('hourlyRate') as string) : null,
      departmentId: formData.get('departmentId') === 'none' ? null : formData.get('departmentId'),
    };

    if (editingPosition) {
      updatePositionMutation.mutate({ id: editingPosition.id, data: positionData });
    } else {
      createPositionMutation.mutate(positionData);
    }
  };

  const canManage = hasPermission(Permission.MANAGE_EMPLOYEES);

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Job Positions</h1>
        <p className="text-muted-foreground">Define roles, responsibilities, and compensation</p>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search positions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-positions"
          />
        </div>
        
        {canManage && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-position">
                <Plus className="h-4 w-4 mr-2" />
                Add Position
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Position</DialogTitle>
                <DialogDescription>
                  Add a new job position with role details and compensation.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Position Title</Label>
                    <Input
                      id="title"
                      name="title"
                      placeholder="e.g., Line Cook, Server, Manager"
                      required
                      data-testid="input-position-title"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Job Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Describe the role responsibilities and requirements..."
                      data-testid="textarea-position-description"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                    <Input
                      id="hourlyRate"
                      name="hourlyRate"
                      type="number"
                      step="0.25"
                      min="0"
                      placeholder="15.00"
                      data-testid="input-position-hourly-rate"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="departmentId">Department</Label>
                    <select
                      id="departmentId"
                      name="departmentId"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="select-position-department"
                    >
                      <option value="none">No department assigned</option>
                      {departments.map((dept: any) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createPositionMutation.isPending} data-testid="button-save-position">
                    {createPositionMutation.isPending ? 'Creating...' : 'Create Position'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Positions Grid */}
      {isLoading ? (
        <div className="text-center py-12">Loading positions...</div>
      ) : filteredPositions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No positions found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? 'No positions match your search.' : 'Get started by creating your first job position.'}
            </p>
            {canManage && !searchTerm && (
              <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-position">
                <Plus className="h-4 w-4 mr-2" />
                Create First Position
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPositions.map((position: Position) => (
            <Card key={position.id} className="hover:shadow-lg transition-shadow" data-testid={`card-position-${position.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    <span>{position.title}</span>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingPosition(position)}
                        data-testid={`button-edit-position-${position.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePositionMutation.mutate(position.id)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`button-delete-position-${position.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardTitle>
                {position.description && (
                  <CardDescription className="line-clamp-2">{position.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {position.hourlyRate && (
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-600" data-testid={`text-hourly-rate-${position.id}`}>
                        ${position.hourlyRate.toFixed(2)}/hour
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span data-testid={`text-employee-count-${position.id}`}>
                      {employees.filter((emp: any) => emp.positionId === position.id).length} employees
                    </span>
                  </div>
                  {position.department && (
                    <Badge variant="outline" data-testid={`badge-department-${position.id}`}>
                      {position.department.name}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingPosition} onOpenChange={() => setEditingPosition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
            <DialogDescription>
              Update position details and compensation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-title">Position Title</Label>
                <Input
                  id="edit-title"
                  name="title"
                  defaultValue={editingPosition?.title}
                  required
                  data-testid="input-edit-position-title"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Job Description</Label>
                <Textarea
                  id="edit-description"
                  name="description"
                  defaultValue={editingPosition?.description}
                  data-testid="textarea-edit-position-description"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-hourlyRate">Hourly Rate ($)</Label>
                <Input
                  id="edit-hourlyRate"
                  name="hourlyRate"
                  type="number"
                  step="0.25"
                  min="0"
                  defaultValue={editingPosition?.hourlyRate}
                  data-testid="input-edit-position-hourly-rate"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updatePositionMutation.isPending} data-testid="button-update-position">
                {updatePositionMutation.isPending ? 'Updating...' : 'Update Position'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}