import { useEmployeeIdentity } from '@/hooks/useEmployeeIdentity';
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Play, Square, Coffee, Timer, Calendar, User, MapPin } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { format, isToday, parseISO } from "date-fns";

interface TimeEntry {
  id: string;
  employeeId: string;
  clockInTime: string;
  clockOutTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
  totalHours?: string;
  status: 'clocked-in' | 'clocked-out' | 'on-break';
  notes?: string;
  date: string;
}

interface Shift {
  id: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  date: string;
  position?: string;
  notes?: string;
}

export default function EmployeeTimeClock() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showClockOutDialog, setShowClockOutDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {employeeId:userId,locationId} = useEmployeeIdentity();
  

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Get current user's time entries
  const { data: myTimeEntries = [], isLoading: entriesLoading } = useQuery<TimeEntry[]>({
    queryKey: [`/api/employees/${userId}/time-entries`],
    enabled: !!userId,
  });

  // Get current user's scheduled shifts
  const { data: myShifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: [`/api/employees/${userId}/shifts`],
    enabled: !!userId,
  });

  // Get employee profile to determine their location
  const { data: employeeProfile } = useQuery<{ 
    firstName: string; 
    lastName: string;
    location?: { id: string; name: string };
  }>({
    queryKey: [`/api/employees/${userId}/profile`],
    enabled: !!userId,
  });

  // Get today's time entry if exists
  const todayEntry = myTimeEntries.find(entry => 
    isToday(parseISO(entry.clockInTime))
  );

  // Get today's scheduled shift
  const todayShift = myShifts.find(shift => 
    isToday(parseISO(shift.date))
  );

  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User not authenticated');
      }
      return await apiRequest('POST', `/api/employees/${userId}/clock-in`, {});
    },
    onSuccess: () => {
      toast({ title: "Clocked In", description: "You've successfully clocked in for your shift!" });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${userId}/time-entries`] });
    },
    onError: (error) => {
      console.error('Clock in error:', error);
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        toast({ 
          title: "Authentication Error", 
          description: "Please refresh the page and log in again", 
          variant: "destructive" 
        });
      } else {
        toast({ title: "Error", description: "Failed to clock in", variant: "destructive" });
      }
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/employees/${userId}/clock-out`, {
        notes: clockOutNotes
      });
    },
    onSuccess: () => {
      toast({ title: "Clocked Out", description: "You've successfully clocked out. Have a great day!" });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${userId}/time-entries`] });
      setShowClockOutDialog(false);
      setClockOutNotes("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clock out", variant: "destructive" });
    },
  });

  const startBreakMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/employees/${userId}/break-start`, {});
    },
    onSuccess: () => {
      toast({ title: "Break Started", description: "Enjoy your break!" });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${userId}/time-entries`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to start break", variant: "destructive" });
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/employees/${userId}/break-end`, {});
    },
    onSuccess: () => {
      toast({ title: "Break Ended", description: "Welcome back!" });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${userId}/time-entries`] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to end break", variant: "destructive" });
    },
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'clocked-in': return 'bg-green-900/80 text-green-200 border-green-600';
      case 'on-break': return 'bg-yellow-900/80 text-yellow-200 border-yellow-600';
      case 'clocked-out': return 'bg-slate-700/80 text-slate-300 border-slate-500';
      default: return 'bg-slate-700/80 text-slate-300 border-slate-500';
    }
  };

  const calculateHours = (clockIn: string, clockOut?: string) => {
    if (!clockOut) return 'In Progress';
    const start = parseISO(clockIn);
    const end = parseISO(clockOut);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return `${hours.toFixed(2)} hours`;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header with live clock */}
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-6 text-white border border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-white">My Time Clock</h1>
            <p className="text-slate-300 dark:text-slate-400">
              Clock in and out, manage breaks, and view your work hours
            </p>
            {employeeProfile?.location && (
              <div className="flex items-center mt-2 text-slate-300">
                <MapPin className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">{employeeProfile.location.name}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-white">
              {format(currentTime, 'h:mm:ss a')}
            </div>
            <div className="text-sm text-slate-300 dark:text-slate-400">
              {format(currentTime, 'EEEE, MMMM d, yyyy')}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Clock In/Out Card */}
        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center text-slate-900 dark:text-white">
              <Clock className="h-5 w-5 mr-2" />
              Today's Time
            </CardTitle>
            <CardDescription>
              Current status and today's time tracking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayEntry ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground dark:text-gray-300">Status:</span>
                  <Badge className={getStatusColor(todayEntry.status)}>
                    {todayEntry.status === 'clocked-in' ? 'Working' :
                     todayEntry.status === 'on-break' ? 'On Break' : 'Finished'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground dark:text-gray-300">Clock In:</span>
                  <span className="font-medium dark:text-gray-100">
                    {todayEntry.clockInTime ? format(parseISO(todayEntry.clockInTime), 'h:mm a') : 'N/A'}
                  </span>
                </div>
                
                {todayEntry.clockOutTime && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground dark:text-gray-300">Clock Out:</span>
                    <span className="font-medium dark:text-gray-100">
                      {format(parseISO(todayEntry.clockOutTime), 'h:mm a')}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground dark:text-gray-300">Total Hours:</span>
                  <span className="font-medium dark:text-gray-100">
                    {todayEntry.clockInTime ? calculateHours(todayEntry.clockInTime, todayEntry.clockOutTime) : 'N/A'}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 space-y-2">
                  {todayEntry.status === 'clocked-out' ? (
                    <Button 
                      onClick={() => clockInMutation.mutate()}
                      disabled={clockInMutation.isPending}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Clock In
                    </Button>
                  ) : todayEntry.status === 'clocked-in' ? (
                    <div className="space-y-2">
                      <Button 
                        onClick={() => setShowClockOutDialog(true)}
                        disabled={clockOutMutation.isPending}
                        className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white"
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Clock Out
                      </Button>
                      <Button 
                        onClick={() => startBreakMutation.mutate()}
                        disabled={startBreakMutation.isPending}
                        variant="outline"
                        className="w-full border-slate-700 text-slate-700 hover:bg-slate-100 dark:border-slate-300 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Coffee className="h-4 w-4 mr-2" />
                        Start Break
                      </Button>
                    </div>
                  ) : todayEntry.status === 'on-break' ? (
                    <Button 
                      onClick={() => endBreakMutation.mutate()}
                      disabled={endBreakMutation.isPending}
                      className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white"
                    >
                      <Timer className="h-4 w-4 mr-2" />
                      End Break
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="p-6 rounded-xl bg-card dark:bg-gray-800 border-2 border-dashed border-border dark:border-gray-600">
                  <Clock className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-muted-foreground dark:text-gray-300">
                    You haven't clocked in today
                  </p>
                </div>
                <Button 
                  onClick={() => clockInMutation.mutate()}
                  disabled={clockInMutation.isPending || !userId}
                  variant="default"
                  className="w-full !bg-gradient-to-r !from-orange-500 !to-red-600 hover:!from-orange-600 hover:!to-red-700 !text-white !border-0 shadow-lg"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {!userId ? 'Authentication Required' : 'Clock In'}
                </Button>
                {!userId && (
                  <p className="text-sm text-red-600">
                    Please refresh the page and log in again
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Schedule Card */}
        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center text-slate-900 dark:text-white">
              <Calendar className="h-5 w-5 mr-2" />
              Today's Schedule
            </CardTitle>
            <CardDescription>
              Your scheduled shift for today
            </CardDescription>
          </CardHeader>
          <CardContent>
            {todayShift ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground dark:text-gray-300">Scheduled:</span>
                  <span className="font-medium dark:text-gray-100">
                    {format(parseISO(todayShift.startTime), 'h:mm a')} - {format(parseISO(todayShift.endTime), 'h:mm a')}
                  </span>
                </div>
                {todayShift.position && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground dark:text-gray-300">Position:</span>
                    <span className="font-medium dark:text-gray-100">{todayShift.position}</span>
                  </div>
                )}
                {todayShift.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Notes:</p>
                    <p className="text-sm">{todayShift.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-2">
                <Calendar className="h-8 w-8 mx-auto text-gray-400" />
                <p className="text-muted-foreground dark:text-gray-300">
                  No scheduled shift today
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Time Entries */}
      <Card className="bg-card dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-slate-900 dark:text-white">
            <Timer className="h-5 w-5 mr-2" />
            My Recent Hours
          </CardTitle>
          <CardDescription>
            Your time entries for the past 7 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : myTimeEntries.length > 0 ? (
            <div className="space-y-3">
              {myTimeEntries.slice(0, 7).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div>
                    <div className="font-medium dark:text-gray-100">
                      {format(parseISO(entry.clockInTime), 'EEEE, MMM d')}
                    </div>
                    <div className="text-sm text-muted-foreground dark:text-gray-300">
                      {format(parseISO(entry.clockInTime), 'h:mm a')} - {' '}
                      {entry.clockOutTime ? format(parseISO(entry.clockOutTime), 'h:mm a') : 'In progress'}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={getStatusColor(entry.status)} variant="secondary">
                      {entry.status === 'clocked-in' ? 'Working' :
                       entry.status === 'on-break' ? 'On Break' : 'Completed'}
                    </Badge>
                    <div className="text-sm text-muted-foreground dark:text-gray-300 mt-1">
                      {calculateHours(entry.clockInTime, entry.clockOutTime)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Timer className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-muted-foreground dark:text-gray-300">
                No time entries found
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clock Out Dialog */}
      <Dialog open={showClockOutDialog} onOpenChange={setShowClockOutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clock Out</DialogTitle>
            <DialogDescription>
              You're about to clock out for the day. Any notes about your shift?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about your shift today..."
                value={clockOutNotes}
                onChange={(e) => setClockOutNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClockOutDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white"
            >
              <Square className="h-4 w-4 mr-2" />
              Clock Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}