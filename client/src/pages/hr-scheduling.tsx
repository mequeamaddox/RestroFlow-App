import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar, Clock, Plus, Users, Edit, Trash2, AlertTriangle, DollarSign, ChevronLeft, ChevronRight, Filter, Printer, Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "@/contexts/LocationContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

const shiftFormSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  breakDuration: z.number().min(0).max(480).default(30),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  notes: z.string().optional(),
});

type ShiftFormData = z.infer<typeof shiftFormSchema>;

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position?: { id: string; title: string };
  department?: { id: string; name: string };
  hourlyRate?: string;
}

interface Shift {
  id: string;
  employeeId: string;
  locationId: string;
  departmentId?: string;
  positionId?: string;
  date: string;
  startTime: string;
  endTime: string;
  breakDuration: number;
  status: string;
  notes?: string;
  employee?: Employee;
}

export default function HRScheduling() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const { toast } = useToast();
  const { currentLocation } = useLocation();

  const { data: employees = [] } = useQuery<Employee[]>({
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

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ['/api/hr/shifts', currentLocation?.id],
    queryFn: async () => {
      const response = await fetch(`/api/hr/shifts?locationId=${currentLocation?.id}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch shifts');
      const data = await response.json();
      console.log('Loaded shifts:', data);
      return data;
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

  const form = useForm<ShiftFormData>({
    resolver: zodResolver(shiftFormSchema),
    defaultValues: {
      employeeId: "",
      date: selectedDate,
      startTime: "09:00",
      endTime: "17:00",
      breakDuration: 30,
      departmentId: "",
      positionId: "",
      notes: "",
    },
  });

  const createShiftMutation = useMutation({
    mutationFn: async (data: ShiftFormData) => {
      const payload: any = {
        ...data,
        locationId: currentLocation?.id,
        departmentId: data.departmentId || null,
        positionId: data.positionId || null,
      };
      console.log('Creating shift with payload:', payload);
      const result = await apiRequest('POST', `/api/hr/shifts?locationId=${currentLocation?.id}`, payload);
      console.log('Shift created:', result);
      return result;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/shifts', currentLocation?.id] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      console.error('Failed to create shift:', error);
      toast({ title: "Error", description: "Failed to create shift", variant: "destructive" });
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ShiftFormData }) => {
      const payload: any = {
        ...data,
        locationId: currentLocation?.id,
        departmentId: data.departmentId || null,
        positionId: data.positionId || null,
      };
      return await apiRequest('PUT', `/api/hr/shifts/${id}?locationId=${currentLocation?.id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/shifts', currentLocation?.id] });
      setEditingShift(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update shift", variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      return await apiRequest('DELETE', `/api/hr/shifts/${shiftId}?locationId=${currentLocation?.id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/shifts', currentLocation?.id] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete shift", variant: "destructive" });
    },
  });

  const onSubmit = (data: ShiftFormData) => {
    const conflicts = detectConflicts(data, editingShift?.id);
    if (conflicts.length > 0) {
      toast({
        title: "Scheduling Conflict",
        description: `${conflicts[0].employee?.firstName} ${conflicts[0].employee?.lastName} already has a shift at this time`,
        variant: "destructive"
      });
      return;
    }

    if (editingShift) {
      updateShiftMutation.mutate({ id: editingShift.id, data });
    } else {
      createShiftMutation.mutate(data);
    }
  };

  const getWeekDates = (date: string) => {
    const currentDate = new Date(date);
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() - currentDate.getDay() + 1);
    
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      week.push(day.toISOString().split('T')[0]);
    }
    return week;
  };

  const getShiftsForDate = (date: string) => {
    let dateShifts = shifts.filter(shift => shift.date === date);
    
    if (departmentFilter !== "all") {
      dateShifts = dateShifts.filter(shift => 
        shift.departmentId === departmentFilter || shift.employee?.department?.id === departmentFilter
      );
    }
    
    return dateShifts;
  };

  const getShiftHours = (startTime: string, endTime: string, breakDuration: number) => {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Math.max(0, hours - (breakDuration / 60));
  };

  const calculateLaborCost = (shift: Shift): number => {
    const employee = employees.find(e => e.id === shift.employeeId);
    if (!employee?.hourlyRate) return 0;
    const hours = getShiftHours(shift.startTime, shift.endTime, shift.breakDuration);
    return hours * parseFloat(employee.hourlyRate);
  };

  const detectConflicts = (newShift: ShiftFormData, excludeShiftId?: string): Shift[] => {
    return shifts.filter(existingShift => {
      if (excludeShiftId && existingShift.id === excludeShiftId) return false;
      if (existingShift.employeeId !== newShift.employeeId) return false;
      if (existingShift.date !== newShift.date) return false;
      
      const newStart = new Date(`2000-01-01T${newShift.startTime}`);
      const newEnd = new Date(`2000-01-01T${newShift.endTime}`);
      const existingStart = new Date(`2000-01-01T${existingShift.startTime}`);
      const existingEnd = new Date(`2000-01-01T${existingShift.endTime}`);
      
      return (newStart < existingEnd && newEnd > existingStart);
    });
  };

  const weekDates = getWeekDates(selectedDate);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const weeklyStats = useMemo(() => {
    const weekShifts = shifts.filter(shift => weekDates.includes(shift.date));
    const totalHours = weekShifts.reduce((sum, shift) => 
      sum + getShiftHours(shift.startTime, shift.endTime, shift.breakDuration), 0
    );
    const totalCost = weekShifts.reduce((sum, shift) => sum + calculateLaborCost(shift), 0);
    const uniqueEmployees = new Set(weekShifts.map(s => s.employeeId)).size;
    
    return {
      totalShifts: weekShifts.length,
      totalHours: totalHours.toFixed(1),
      totalCost: totalCost.toFixed(2),
      uniqueEmployees,
    };
  }, [shifts, weekDates, employees]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);
    const offset = direction === 'prev' ? -7 : 7;
    current.setDate(current.getDate() + offset);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const generatePDF = async (includeStats: boolean) => {
    const styles = StyleSheet.create({
      page: { padding: 30, backgroundColor: '#ffffff' },
      header: { marginBottom: 20, textAlign: 'center' },
      title: { fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
      subtitle: { fontSize: 12, color: '#666', marginBottom: 3 },
      dateRange: { fontSize: 14, marginBottom: 20 },
      statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20, paddingVertical: 10, backgroundColor: '#f3f4f6', borderRadius: 5 },
      statBox: { alignItems: 'center' },
      statLabel: { fontSize: 10, color: '#666', marginBottom: 3 },
      statValue: { fontSize: 18, fontWeight: 'bold' },
      calendar: { flexDirection: 'row', border: '1pt solid #d1d5db' },
      dayColumn: { flex: 1, borderRight: '1pt solid #d1d5db' },
      dayHeader: { backgroundColor: '#f9fafb', padding: 8, borderBottom: '1pt solid #d1d5db', alignItems: 'center' },
      dayName: { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
      dayDate: { fontSize: 14, fontWeight: 'bold' },
      dayTotal: { fontSize: 8, color: '#666', marginTop: 2 },
      shiftContainer: { padding: 4 },
      shift: { backgroundColor: '#e5e7eb', padding: 6, marginBottom: 4, borderRadius: 3, border: '1pt solid #d1d5db' },
      shiftName: { fontSize: 9, fontWeight: 'bold', marginBottom: 2 },
      shiftTime: { fontSize: 8, color: '#4b5563', marginBottom: 2 },
      shiftDetails: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 8 },
      shiftHours: { color: '#6b7280' },
      shiftCost: { fontWeight: 'bold' },
      copyType: { fontSize: 10, color: '#999', marginTop: 5 },
    });

    const weekStart = new Date(weekDates[0]).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const weekEnd = new Date(weekDates[6]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const SchedulePDF = () => (
      <Document>
        <Page size="A4" orientation="landscape" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>{includeStats ? 'Weekly Schedule' : 'Staff Schedule'}</Text>
            <Text style={styles.subtitle}>{currentLocation?.name}</Text>
            <Text style={styles.dateRange}>{weekStart} - {weekEnd}</Text>
            {includeStats && <Text style={styles.copyType}>Manager Copy</Text>}
          </View>

          {includeStats && (
            <View style={styles.statsContainer}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total Shifts</Text>
                <Text style={styles.statValue}>{weeklyStats.totalShifts}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total Hours</Text>
                <Text style={styles.statValue}>{weeklyStats.totalHours}h</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Labor Cost</Text>
                <Text style={styles.statValue}>${weeklyStats.totalCost}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Staff Scheduled</Text>
                <Text style={styles.statValue}>{weeklyStats.uniqueEmployees}</Text>
              </View>
            </View>
          )}

          <View style={styles.calendar}>
            {weekDates.map((date, index) => {
              const dayShifts = getShiftsForDate(date);
              const dayTotal = dayShifts.reduce((sum, shift) =>
                sum + getShiftHours(shift.startTime, shift.endTime, shift.breakDuration), 0
              );
              const dayCost = includeStats ? dayShifts.reduce((sum, shift) =>
                sum + calculateLaborCost(shift), 0
              ) : 0;

              return (
                <View key={date} style={[styles.dayColumn, index === 6 ? { borderRight: 0 } : {}]}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayName}>{dayNames[index]}</Text>
                    <Text style={styles.dayDate}>{new Date(date).getDate()}</Text>
                    {includeStats && dayTotal > 0 && (
                      <>
                        <Text style={styles.dayTotal}>{dayTotal.toFixed(0)}h</Text>
                        {dayCost > 0 && (
                          <Text style={styles.dayTotal}>${dayCost.toFixed(0)}</Text>
                        )}
                      </>
                    )}
                  </View>
                  <View style={styles.shiftContainer}>
                    {dayShifts.map((shift) => {
                      const employee = employees.find(emp => emp.id === shift.employeeId);
                      const hours = getShiftHours(shift.startTime, shift.endTime, shift.breakDuration);
                      const cost = calculateLaborCost(shift);

                      return (
                        <View key={shift.id} style={styles.shift}>
                          <Text style={styles.shiftName}>
                            {employee?.firstName} {employee?.lastName}
                          </Text>
                          <Text style={styles.shiftTime}>
                            {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}
                          </Text>
                          {includeStats ? (
                            <View style={styles.shiftDetails}>
                              <Text style={styles.shiftHours}>{hours.toFixed(1)}h</Text>
                              {cost > 0 && <Text style={styles.shiftCost}>${cost.toFixed(0)}</Text>}
                            </View>
                          ) : (
                            <View style={styles.shiftDetails}>
                              <Text style={styles.shiftHours}>{hours.toFixed(1)}h</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </Page>
      </Document>
    );

    try {
      const copyType = includeStats ? 'manager' : 'staff';
      const blob = await pdf(<SchedulePDF />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `schedule-${copyType}-${weekStart.replace(/\s/g, '-')}-${weekEnd.replace(/\s/g, '-')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Success", description: `${copyType === 'manager' ? 'Manager' : 'Staff'} schedule PDF downloaded` });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    }
  };

  if (!currentLocation) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Please select a location to view schedules.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Weekly Schedule
          </h1>
          <p className="text-gray-400 mt-1">{currentLocation.name}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => generatePDF(true)}
            variant="outline"
            data-testid="button-download-manager-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Manager Copy
          </Button>
          <Button 
            onClick={() => generatePDF(false)}
            variant="outline"
            data-testid="button-download-staff-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Staff Copy
          </Button>
          <Button 
            onClick={() => {
              form.reset({
                employeeId: "",
                date: selectedDate,
                startTime: "09:00",
                endTime: "17:00",
                breakDuration: 30,
                notes: "",
              });
              setIsCreateDialogOpen(true);
            }}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Shift
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Total Shifts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-400">{weeklyStats.totalShifts}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border-purple-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-400">{weeklyStats.totalHours}h</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/10 border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Labor Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">${weeklyStats.totalCost}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-pink-500/10 to-pink-600/10 border-pink-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Staff Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pink-400">{weeklyStats.uniqueEmployees}</div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigateWeek('prev')}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="text-lg font-semibold">
                {new Date(weekDates[0]).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {new Date(weekDates[6]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <Button variant="ghost" size="icon" onClick={() => navigateWeek('next')}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            {departments.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-t border-gray-800">
            {weekDates.map((date, index) => {
              const dayShifts = getShiftsForDate(date);
              const isToday = date === new Date().toISOString().split('T')[0];
              const dayTotal = dayShifts.reduce((sum, shift) => 
                sum + getShiftHours(shift.startTime, shift.endTime, shift.breakDuration), 0
              );

              return (
                <div 
                  key={date} 
                  className={`border-r border-gray-800 last:border-r-0 ${isToday ? 'bg-blue-500/5' : ''}`}
                >
                  <div className={`p-4 border-b border-gray-800 text-center ${isToday ? 'bg-blue-500/10' : ''}`}>
                    <div className="text-xs text-muted-foreground font-medium">{dayNames[index]}</div>
                    <div className={`text-lg font-bold mt-1 ${isToday ? 'text-blue-400' : 'text-gray-200'}`}>
                      {new Date(date).getDate()}
                    </div>
                    {dayTotal > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">{dayTotal.toFixed(0)}h</div>
                    )}
                  </div>
                  <div className="p-2 space-y-2 min-h-[400px]">
                    {dayShifts.map((shift) => {
                      const employee = employees.find(emp => emp.id === shift.employeeId);
                      const hours = getShiftHours(shift.startTime, shift.endTime, shift.breakDuration);
                      const cost = calculateLaborCost(shift);
                      
                      return (
                        <div 
                          key={shift.id} 
                          className="group relative bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg p-2 cursor-pointer hover:shadow-lg transition-all"
                          onClick={() => {
                            setEditingShift(shift);
                            form.reset({
                              employeeId: shift.employeeId,
                              date: shift.date,
                              startTime: shift.startTime,
                              endTime: shift.endTime,
                              breakDuration: shift.breakDuration,
                              departmentId: shift.departmentId || "",
                              positionId: shift.positionId || "",
                              notes: shift.notes || "",
                            });
                            setIsCreateDialogOpen(true);
                          }}
                        >
                          <div className="text-white text-xs font-semibold truncate">
                            {employee?.firstName} {employee?.lastName}
                          </div>
                          <div className="text-white/80 text-xs mt-1">
                            {shift.startTime.slice(0, 5)} - {shift.endTime.slice(0, 5)}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-white/70 text-xs">{hours.toFixed(1)}h</span>
                            {cost > 0 && <span className="text-white text-xs font-bold">${cost.toFixed(0)}</span>}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteShiftMutation.mutate(shift.id);
                            }}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 rounded p-1"
                          >
                            <Trash2 className="h-3 w-3 text-white" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Shift Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingShift} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingShift(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Edit Shift' : 'Create New Shift'}</DialogTitle>
            <DialogDescription>Schedule a shift for an employee</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="employeeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.firstName} {employee.lastName}
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
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="breakDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Break Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0" 
                        max="480" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Special instructions" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setEditingShift(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createShiftMutation.isPending || updateShiftMutation.isPending}>
                  {editingShift ? 'Update' : 'Create'} Shift
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
