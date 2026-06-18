import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from '@/contexts/LocationContext';
import {
  UserPlus,
  Mail,
  Clock,
  Search,
  X,
  RefreshCw,
  AlertCircle,
  MapPin,
  Users,
  Briefcase,
  Calendar,
  Send,
} from 'lucide-react';
import InviteEmployeeDialog from '@/components/hr/InviteEmployeeDialog';
import type { InvitationToken, Location, Department } from '@shared/schema';

export default function HRInvitations() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentLocation, hasHRAccess } = useLocation();

  // Fetch invitations
  const { 
    data: invitations = [], 
    isLoading, 
    error,
    refetch 
  } = useQuery<InvitationToken[]>({
    queryKey: ['/api/invitations'],
  });

  // Fetch locations for display
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  // Fetch departments for display
  const { data: departments = [] } = useQuery<Department[]>({
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

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return await apiRequest('DELETE', `/api/invitations/${invitationId}`);
    },
    onSuccess: () => {
      toast({
        title: 'Invitation Cancelled',
        description: 'The invitation has been cancelled successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Cancel',
        description: error.message || 'There was an error cancelling the invitation.',
        variant: 'destructive',
      });
    },
  });

  // Resend invitation mutation (cleanup + send new)
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitation: InvitationToken) => {
      // For now, we'll use the existing invitation data to create a new one
      const invitationData = {
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        email: invitation.email,
        role: invitation.role,
        locationId: invitation.locationId,
        departmentId: invitation.departmentId,
        positionId: invitation.positionId,
        startDate: invitation.startDate,
        hourlyRate: invitation.hourlyRate,
        salary: invitation.salary,
      };
      
      // Cancel the old invitation first
      await apiRequest('DELETE', `/api/invitations/${invitation.id}`);
      
      // Create a new invitation
      return await apiRequest('POST', '/api/invitations', invitationData);
    },
    onSuccess: () => {
      toast({
        title: 'Invitation Resent',
        description: 'A new invitation has been sent successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invitations'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Resend',
        description: error.message || 'There was an error resending the invitation.',
        variant: 'destructive',
      });
    },
  });

  // Filter invitations
  const filteredInvitations = invitations.filter((invitation) => {
    const matchesSearch = 
      invitation.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${invitation.firstName} ${invitation.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || invitation.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string, expiresAt: Date | null) => {
    const isExp = expiresAt ? new Date(expiresAt) < new Date() : false;
    
    if (isExp && status === 'pending') {
      return <Badge variant="destructive">Expired</Badge>;
    }
    
    switch (status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'accepted':
        return <Badge variant="default">Accepted</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      team_lead: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      employee: 'bg-accent text-foreground dark:bg-gray-900 dark:text-gray-200',
    };

    return (
      <Badge className={colors[role as keyof typeof colors] || colors.employee}>
        {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    );
  };

  const isExpired = (expiresAt: Date | null) => expiresAt ? new Date(expiresAt) < new Date() : false;
  const canResend = (invitation: InvitationToken) => 
    invitation.status === 'pending' || isExpired(invitation.expiresAt);

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

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to Load Invitations</h3>
              <p className="text-muted-foreground mb-4">There was an error loading the invitation data.</p>
              <Button onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Employee Invitations
          </h1>
          <p className="text-muted-foreground">Manage employee invitations and onboarding</p>
        </div>
        
        <Button 
          onClick={() => setIsInviteDialogOpen(true)}
          data-testid="button-invite-employee"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Employee
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invitations</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invitations.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invitations.filter(inv => inv.status === 'pending' && !isExpired(inv.expiresAt)).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invitations.filter(inv => inv.status === 'accepted').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {invitations.filter(inv => isExpired(inv.expiresAt) && inv.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-invitations"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              onClick={() => refetch()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invitation History</CardTitle>
          <CardDescription>
            View and manage all employee invitations sent from your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredInvitations.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Invitations Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'No invitations match your current filters.'
                  : 'You haven\'t sent any employee invitations yet.'
                }
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button onClick={() => setIsInviteDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Send First Invitation
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent Date</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvitations.map((invitation) => (
                    <TableRow key={invitation.id} data-testid={`row-invitation-${invitation.id}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">
                            {invitation.firstName} {invitation.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {invitation.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRoleBadge(invitation.role)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">
                            {locations.find(l => l.id === invitation.locationId)?.name || 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">
                            {invitation.departmentId ? departments.find(d => d.id === invitation.departmentId)?.name || 'N/A' : 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(invitation.status || 'pending', invitation.expiresAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          <span className="text-sm">
                            {invitation.createdAt ? format(new Date(invitation.createdAt), 'MMM dd, yyyy') : 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span className={`text-sm ${isExpired(invitation.expiresAt) ? 'text-red-600' : ''}`}>
                            {invitation.expiresAt ? format(new Date(invitation.expiresAt), 'MMM dd, HH:mm') : 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canResend(invitation) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resendInvitationMutation.mutate(invitation)}
                              disabled={resendInvitationMutation.isPending}
                              data-testid={`button-resend-${invitation.id}`}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Resend
                            </Button>
                          )}
                          
                          {invitation.status === 'pending' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-cancel-${invitation.id}`}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Cancel
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to cancel the invitation for{' '}
                                    <strong>{invitation.firstName} {invitation.lastName}</strong>?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep Invitation</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Cancel Invitation
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Employee Dialog */}
      <InviteEmployeeDialog 
        open={isInviteDialogOpen} 
        onOpenChange={setIsInviteDialogOpen} 
      />
    </div>
  );
}