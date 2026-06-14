import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Play, Square, Coffee, UserCheck, Timer, Edit, Trash2, Save, Calendar, Filter, CalendarDays, List, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, Permission } from "@/contexts/PermissionContext";
import { useLocation } from "@/contexts/LocationContext";
import { useEffect } from "react";

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  profilePhoto?: string;
  department?: { name: string };
  position?: { title: string };
}

interface TimeEntry {
  id: string;
  employeeId: string;
  clockInTime: string;
  clockOutTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
  totalHours?: string;
  status: 'clocked-in' | 'clocked-out' | 'on-break' | 'open' | 'closed';
  notes?: string;
  employee?: Employee;
  source?: 'manual' | 'pos';
  posProvider?: string;
}

export default function HRTimeClock() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { currentLocation } = useLocation();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showManualEntryDialog, setShowManualEntryDialog] = useState(false);
  const [manualEntryForm, setManualEntryForm] = useState({
    employeeId: '',
    clockInTime: '',
    clockOutTime: '',
    breakStartTime: '',
    breakEndTime: '',
    notes: ''
  });

  // Redirect employees to their personal time clock
  useEffect(() => {
    const isEmployee = (user as any)?.role === 'employee';
    if (isEmployee || !hasPermission(Permission.MANAGE_EMPLOYEES)) {
      window.location.href = '/employee/time-clock';
    }
  }, [user, hasPermission]);
  const [dateRange, setDateRange] = useState('7'); // days to look back
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [editForm, setEditForm] = useState({
    clockInTime: '',
    clockOutTime: '',
    breakStartTime: '',
    breakEndTime: '',
    notes: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: timeEntries = [], isLoading: entriesLoading } = useQuery<TimeEntry[]>({
    queryKey: [`/api/hr/time-entries?includeHistory=true`, currentLocation?.id],
    enabled: !!currentLocation,
  });

  const clockInMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      return await apiRequest('POST', `/api/hr/time-clock/in/${employeeId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Clocked in successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-entries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/hr/time-entries?includeHistory=true`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clock in", variant: "destructive" });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return await apiRequest('POST', `/api/hr/time-clock/out/${entryId}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Clocked out successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-entries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/hr/time-entries?includeHistory=true`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clock out", variant: "destructive" });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      return await apiRequest('PUT', `/api/hr/time-entries/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Time entry updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-entries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/hr/time-entries?includeHistory=true`] });
      setShowEditDialog(false);
      setEditingEntry(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update time entry", variant: "destructive" });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return await apiRequest('DELETE', `/api/hr/time-entries/${entryId}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Time entry deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-entries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/hr/time-entries?includeHistory=true`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete time entry", variant: "destructive" });
    },
  });

  const createManualEntryMutation = useMutation({
    mutationFn: async (entryData: any) => {
      return await apiRequest('POST', '/api/hr/time-entries/manual', entryData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Manual time entry created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/time-entries'] });
      queryClient.invalidateQueries({ queryKey: [`/api/hr/time-entries?includeHistory=true`] });
      setShowManualEntryDialog(false);
      setManualEntryForm({
        employeeId: '',
        clockInTime: '',
        clockOutTime: '',
        breakStartTime: '',
        breakEndTime: '',
        notes: ''
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create manual time entry", variant: "destructive" });
    },
  });

  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const currentDate = new Date().toLocaleDateString();

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Get active time entries (employees currently clocked in)
  const activeEntries = timeEntries.filter((entry: TimeEntry) => 
    entry.status === 'clocked-in' || entry.status === 'on-break' || entry.status === 'open'
  );

  // Filter completed entries based on selected date range and employee
  const filteredEntries = timeEntries.filter((entry: TimeEntry) => {
    const entryDate = new Date(entry.clockInTime);
    const daysAgo = new Date();
    const rangeDays = parseInt(dateRange);
    daysAgo.setDate(daysAgo.getDate() - rangeDays);
    
    // Include both manual ('clocked-out') and POS ('closed') completed entries
    const dateMatch = entryDate >= daysAgo && (entry.status === 'clocked-out' || entry.status === 'closed');
    const employeeMatch = selectedEmployee === 'all' || entry.employeeId === selectedEmployee;
    
    return dateMatch && employeeMatch;
  }).sort((a, b) => new Date(b.clockInTime).getTime() - new Date(a.clockInTime).getTime());

  const getActiveEntry = (employeeId: string) => {
    return activeEntries.find((entry: TimeEntry) => entry.employeeId === employeeId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clocked-in':
      case 'open': 
        return 'bg-green-900/80 text-green-200 border-green-600';
      case 'on-break': 
        return 'bg-yellow-900/80 text-yellow-200 border-yellow-600';
      case 'clocked-out':
      case 'closed': 
        return 'bg-slate-700/80 text-slate-300 border-slate-500';
      default: 
        return 'bg-slate-700/80 text-slate-300 border-slate-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'clocked-in':
      case 'open': 
        return <UserCheck className="h-4 w-4" />;
      case 'on-break': 
        return <Coffee className="h-4 w-4" />;
      case 'clocked-out':
      case 'closed': 
        return <Square className="h-4 w-4" />;
      default: 
        return <Clock className="h-4 w-4" />;
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditForm({
      clockInTime: entry.clockInTime ? new Date(entry.clockInTime).toISOString().slice(0, 16) : '',
      clockOutTime: entry.clockOutTime ? new Date(entry.clockOutTime).toISOString().slice(0, 16) : '',
      breakStartTime: entry.breakStartTime ? new Date(entry.breakStartTime).toISOString().slice(0, 16) : '',
      breakEndTime: entry.breakEndTime ? new Date(entry.breakEndTime).toISOString().slice(0, 16) : '',
      notes: entry.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleUpdateEntry = () => {
    if (!editingEntry) return;
    
    const updateData: any = {};
    if (editForm.clockInTime) updateData.clockInTime = editForm.clockInTime;
    if (editForm.clockOutTime) updateData.clockOutTime = editForm.clockOutTime;
    if (editForm.breakStartTime) updateData.breakStartTime = editForm.breakStartTime;
    if (editForm.breakEndTime) updateData.breakEndTime = editForm.breakEndTime;
    updateData.notes = editForm.notes;
    
    updateEntryMutation.mutate({ id: editingEntry.id, data: updateData });
  };

  const handleDeleteEntry = (entryId: string) => {
    if (confirm('Are you sure you want to delete this time entry?')) {
      deleteEntryMutation.mutate(entryId);
    }
  };

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };
  
  const getEntriesForDate = (date: Date | null) => {
    if (!date) return [];
    return filteredEntries.filter(entry => {
      const entryDate = new Date(entry.clockInTime);
      return entryDate.toDateString() === date.toDateString();
    });
  };
  
  const getSelectedDateEntries = () => {
    return getEntriesForDate(selectedDate);
  };
  
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedDate(newDate);
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diff = end.getTime() - start.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (employeesLoading || entriesLoading) {
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
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="h-8 w-8" />
          Time Clock
        </h1>
        <p className="text-muted-foreground">Track employee hours and manage time entries</p>
      </div>

      {/* Current Time Display */}
      <Card className="mb-8 bg-slate-800/80 backdrop-blur-sm border-slate-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            {currentTime}
          </CardTitle>
          <CardDescription className="text-slate-400 text-lg">
            {currentDate}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Currently Clocked In */}
        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <UserCheck className="h-5 w-5 text-green-600" />
              Currently Working ({activeEntries.length})
            </CardTitle>
            <CardDescription className="text-slate-400">Employees currently clocked in or on break</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeEntries.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No employees currently clocked in</p>
              </div>
            ) : (
              activeEntries.map((entry: TimeEntry) => {
                const employee = employees.find((emp: Employee) => emp.id === entry.employeeId);
                if (!employee) return null;

                return (
                  <div key={entry.id} className="flex items-center justify-between p-4 border border-slate-600 rounded-lg bg-slate-700/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={employee.profilePhoto} />
                        <AvatarFallback>{getInitials(employee.firstName, employee.lastName)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{employee.firstName} {employee.lastName}</p>
                          {entry.source === 'pos' && entry.posProvider && (
                            <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-300 border-blue-600">
                              {entry.posProvider.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">{employee.position?.title}</p>
                        <p className="text-xs text-slate-500">
                          Started: {new Date(entry.clockInTime).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={`${getStatusColor(entry.status)} flex items-center justify-center gap-1 border`}>
                        {getStatusIcon(entry.status)}
                        <span className="capitalize">{entry.status.replace('-', ' ')}</span>
                      </Badge>
                      <p className="text-sm text-slate-400 mt-1">
                        {formatDuration(entry.clockInTime)}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => clockOutMutation.mutate(entry.id)}
                        disabled={clockOutMutation.isPending}
                      >
                        Clock Out
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Clock In Interface */}
        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Play className="h-5 w-5 text-blue-600" />
              Clock In Employee
            </CardTitle>
            <CardDescription className="text-slate-400">Select an employee to clock them in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
              {employees
                .filter((employee: Employee) => !getActiveEntry(employee.id))
                .map((employee: Employee) => (
                  <div
                    key={employee.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedEmployeeId === employee.id 
                        ? 'border-blue-500 bg-blue-900/20' 
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => setSelectedEmployeeId(employee.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={employee.profilePhoto} />
                        <AvatarFallback className="text-xs">
                          {getInitials(employee.firstName, employee.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{employee.firstName} {employee.lastName}</p>
                        <p className="text-xs text-muted-foreground">{employee.position?.title}</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {employees.filter((employee: Employee) => !getActiveEntry(employee.id)).length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <UserCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>All employees are currently clocked in</p>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!selectedEmployeeId || clockInMutation.isPending}
              onClick={() => {
                if (selectedEmployeeId) {
                  clockInMutation.mutate(selectedEmployeeId);
                  setSelectedEmployeeId("");
                }
              }}
            >
              <Play className="h-4 w-4 mr-2" />
              Clock In Selected Employee
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Time Entry Management */}
      <Card className="mt-8 bg-slate-800/80 backdrop-blur-sm border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Timer className="h-5 w-5 text-gray-400" />
                Time Entry Management
              </CardTitle>
              <CardDescription className="text-slate-400">View and edit employee time punches from any date range</CardDescription>
            </div>
            <Button onClick={() => setShowManualEntryDialog(true)} data-testid="button-add-manual-entry">
              <Plus className="h-4 w-4 mr-2" />
              Add Manual Entry
            </Button>
          </div>
          
          {/* View Toggle */}
          <div className="flex items-center gap-2 mt-4">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
              data-testid="button-list-view"
            >
              <List className="h-4 w-4 mr-2" />
              List View
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('calendar')}
              data-testid="button-calendar-view"
            >
              <CalendarDays className="h-4 w-4 mr-2" />
              Calendar View
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'list' && (
            <>
              {/* Filter Controls */}
              <div className="flex flex-wrap gap-4 mb-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="dateRange">Date Range:</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 2 weeks</SelectItem>
                      <SelectItem value="30">Last month</SelectItem>
                      <SelectItem value="60">Last 2 months</SelectItem>
                      <SelectItem value="90">Last 3 months</SelectItem>
                      <SelectItem value="180">Last 6 months</SelectItem>
                      <SelectItem value="365">Last year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="employeeFilter">Employee:</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map((employee: Employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">{filteredEntries.length}</span>
                  <span>entries found</span>
                </div>
              </div>
            </>
          )}

          {viewMode === 'list' && (
            <>
              {/* Time Entries */}
              {filteredEntries.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntries.map((entry: TimeEntry) => {
                const employee = employees.find((emp: Employee) => emp.id === entry.employeeId);
                if (!employee) return null;

                return (
                  <div key={entry.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={employee.profilePhoto} />
                        <AvatarFallback className="text-xs">
                          {getInitials(employee.firstName, employee.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{employee.firstName} {employee.lastName}</p>
                          {entry.source === 'pos' && entry.posProvider && (
                            <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-300 border-blue-600">
                              {entry.posProvider.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{employee.position?.title}</p>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date:</span>
                        <span className="text-xs">{new Date(entry.clockInTime).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Clock In:</span>
                        <span>{new Date(entry.clockInTime).toLocaleTimeString()}</span>
                      </div>
                      {entry.clockOutTime && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Clock Out:</span>
                          <span>{new Date(entry.clockOutTime).toLocaleTimeString()}</span>
                        </div>
                      )}
                      {entry.totalHours && (
                        <div className="flex justify-between font-medium">
                          <span className="text-muted-foreground">Total Hours:</span>
                          <span>{entry.totalHours}h</span>
                        </div>
                      )}
                      {entry.notes && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Notes:</span>
                          <span className="text-xs">{entry.notes}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Manager Controls */}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditEntry(entry)}
                        data-testid={`button-edit-${entry.id}`}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteEntry(entry.id)}
                        data-testid={`button-delete-${entry.id}`}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Timer className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No completed time entries found for the selected criteria</p>
                  <p className="text-sm">Try expanding the date range or selecting a different employee</p>
                </div>
              )}
            </>
          )}
          
          {viewMode === 'calendar' && (
            <>
              {/* Calendar View */}
              <div className="space-y-4">
                {/* Calendar Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">{formatMonthYear(selectedDate)}</h3>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateMonth('prev')}
                        data-testid="button-prev-month"
                      >
                        ←
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDate(new Date())}
                        data-testid="button-today"
                      >
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateMonth('next')}
                        data-testid="button-next-month"
                      >
                        →
                      </Button>
                    </div>
                  </div>
                  
                  {/* Employee Filter for Calendar */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map((employee: Employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.firstName} {employee.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Day Headers */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-slate-300 bg-slate-700/50">
                      {day}
                    </div>
                  ))}
                  
                  {/* Calendar Days */}
                  {getDaysInMonth(selectedDate).map((date, index) => {
                    const dayEntries = getEntriesForDate(date);
                    const isToday = date && date.toDateString() === new Date().toDateString();
                    const isSelected = date && date.toDateString() === selectedDate.toDateString();
                    
                    return (
                      <div
                        key={index}
                        className={`
                          min-h-[80px] p-2 border cursor-pointer transition-colors
                          ${
                            !date 
                              ? 'bg-slate-800/50 border-slate-600' 
                              : isSelected 
                                ? 'bg-blue-900/50 border-blue-500' 
                                : isToday 
                                  ? 'bg-yellow-900/50 border-yellow-500'
                                  : dayEntries.length > 0 
                                    ? 'bg-green-900/30 border-green-600/50 hover:bg-green-900/50' 
                                    : 'hover:bg-slate-700/50 border-slate-600'
                          }
                        `}
                        onClick={() => date && setSelectedDate(date)}
                        data-testid={date ? `calendar-day-${date.getDate()}` : undefined}
                      >
                        {date && (
                          <>
                            <div className={`text-sm font-medium ${
                              isToday ? 'text-yellow-300' : 
                              isSelected ? 'text-blue-300' :
                              'text-white'
                            }`}>
                              {date.getDate()}
                            </div>
                            {dayEntries.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {dayEntries.slice(0, 2).map(entry => {
                                  const employee = employees.find(emp => emp.id === entry.employeeId);
                                  return (
                                    <div
                                      key={entry.id}
                                      className="text-xs bg-blue-500 text-white px-1 py-0.5 rounded truncate"
                                      title={`${employee?.firstName} ${employee?.lastName}: ${entry.totalHours || '0'}h`}
                                    >
                                      {employee?.firstName?.[0]}{employee?.lastName?.[0]} {entry.totalHours || '0'}h
                                    </div>
                                  );
                                })}
                                {dayEntries.length > 2 && (
                                  <div className="text-xs text-muted-foreground font-medium">
                                    +{dayEntries.length - 2} more
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Selected Date Details */}
                {getSelectedDateEntries().length > 0 && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {selectedDate.toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </CardTitle>
                      <CardDescription>
                        {getSelectedDateEntries().length} time entries
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {getSelectedDateEntries().map((entry: TimeEntry) => {
                          const employee = employees.find((emp: Employee) => emp.id === entry.employeeId);
                          if (!employee) return null;
                          
                          return (
                            <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={employee.profilePhoto} />
                                  <AvatarFallback className="text-xs">
                                    {getInitials(employee.firstName, employee.lastName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{employee.firstName} {employee.lastName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(entry.clockInTime).toLocaleTimeString()} - {entry.clockOutTime ? new Date(entry.clockOutTime).toLocaleTimeString() : 'Active'}
                                  </p>
                                  {entry.totalHours && (
                                    <p className="text-xs text-muted-foreground">{entry.totalHours}h total</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditEntry(entry)}
                                  data-testid={`calendar-edit-${entry.id}`}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  data-testid={`calendar-delete-${entry.id}`}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Time Entry Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>
              {editingEntry && (
                <>Edit time punch for {employees.find(emp => emp.id === editingEntry.employeeId)?.firstName} {employees.find(emp => emp.id === editingEntry.employeeId)?.lastName}</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clockIn" className="text-right">Clock In</Label>
              <Input
                id="clockIn"
                type="datetime-local"
                className="col-span-3"
                value={editForm.clockInTime}
                onChange={(e) => setEditForm({...editForm, clockInTime: e.target.value})}
                data-testid="input-clock-in-time"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clockOut" className="text-right">Clock Out</Label>
              <Input
                id="clockOut"
                type="datetime-local"
                className="col-span-3"
                value={editForm.clockOutTime}
                onChange={(e) => setEditForm({...editForm, clockOutTime: e.target.value})}
                data-testid="input-clock-out-time"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="breakStart" className="text-right">Break Start</Label>
              <Input
                id="breakStart"
                type="datetime-local"
                className="col-span-3"
                value={editForm.breakStartTime}
                onChange={(e) => setEditForm({...editForm, breakStartTime: e.target.value})}
                data-testid="input-break-start-time"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="breakEnd" className="text-right">Break End</Label>
              <Input
                id="breakEnd"
                type="datetime-local"
                className="col-span-3"
                value={editForm.breakEndTime}
                onChange={(e) => setEditForm({...editForm, breakEndTime: e.target.value})}
                data-testid="input-break-end-time"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">Notes</Label>
              <Textarea
                id="notes"
                className="col-span-3"
                value={editForm.notes}
                onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                placeholder="Add notes about this time entry..."
                data-testid="textarea-notes"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateEntry}
              disabled={updateEntryMutation.isPending}
              data-testid="button-save-changes"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Time Entry Dialog */}
      <Dialog open={showManualEntryDialog} onOpenChange={setShowManualEntryDialog}>
        <DialogContent className="max-w-md bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Add Manual Time Entry</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a time entry for an employee who missed clocking in/out.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="manualEmployee" className="text-white">Employee</Label>
              <Select value={manualEntryForm.employeeId} onValueChange={(value) => setManualEntryForm({...manualEntryForm, employeeId: value})}>
                <SelectTrigger data-testid="select-manual-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee: Employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="manualClockIn" className="text-white">Clock In Time *</Label>
              <Input
                id="manualClockIn"
                type="datetime-local"
                value={manualEntryForm.clockInTime}
                onChange={(e) => setManualEntryForm({...manualEntryForm, clockInTime: e.target.value})}
                data-testid="input-manual-clock-in"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="manualClockOut" className="text-white">Clock Out Time</Label>
              <Input
                id="manualClockOut"
                type="datetime-local"
                value={manualEntryForm.clockOutTime}
                onChange={(e) => setManualEntryForm({...manualEntryForm, clockOutTime: e.target.value})}
                data-testid="input-manual-clock-out"
              />
            </div>
            
            <div>
              <Label htmlFor="manualBreakStart" className="text-white">Break Start</Label>
              <Input
                id="manualBreakStart"
                type="datetime-local"
                value={manualEntryForm.breakStartTime}
                onChange={(e) => setManualEntryForm({...manualEntryForm, breakStartTime: e.target.value})}
                data-testid="input-manual-break-start"
              />
            </div>
            
            <div>
              <Label htmlFor="manualBreakEnd" className="text-white">Break End</Label>
              <Input
                id="manualBreakEnd"
                type="datetime-local"
                value={manualEntryForm.breakEndTime}
                onChange={(e) => setManualEntryForm({...manualEntryForm, breakEndTime: e.target.value})}
                data-testid="input-manual-break-end"
              />
            </div>
            
            <div>
              <Label htmlFor="manualNotes" className="text-white">Notes</Label>
              <Textarea
                id="manualNotes"
                value={manualEntryForm.notes}
                onChange={(e) => setManualEntryForm({...manualEntryForm, notes: e.target.value})}
                placeholder="Reason for manual entry (e.g., forgot to clock in)..."
                data-testid="textarea-manual-notes"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowManualEntryDialog(false)} className="border-slate-600 text-slate-300 hover:bg-slate-700">
              Cancel
            </Button>
            <Button 
              onClick={() => createManualEntryMutation.mutate(manualEntryForm)}
              disabled={createManualEntryMutation.isPending || !manualEntryForm.employeeId || !manualEntryForm.clockInTime}
              data-testid="button-create-manual-entry"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createManualEntryMutation.isPending ? "Creating..." : "Create Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}