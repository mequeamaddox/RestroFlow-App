import { useEmployeeIdentity } from '@/hooks/useEmployeeIdentity';
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, User, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, parseISO, isToday, isTomorrow } from "date-fns";

interface Shift {
  id: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  date: string;
  position?: { title: string };
  notes?: string;
  location?: { name: string };
}

export default function EmployeeSchedule() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const { user } = useAuth();
  const {employeeId:userId} = useEmployeeIdentity();

  // Get current user's scheduled shifts
  const { data: myShifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: [`/api/employees/${userId}/shifts`],
    enabled: !!userId,
  });

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 }); // Sunday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 }); // Saturday
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getShiftsForDay = (date: Date) => {
    return myShifts.filter(shift => 
      isSameDay(parseISO(shift.date), date)
    );
  };

  const getTotalHoursForWeek = () => {
    return myShifts
      .filter(shift => {
        const shiftDate = parseISO(shift.date);
        return shiftDate >= weekStart && shiftDate <= weekEnd;
      })
      .reduce((total, shift) => {
        const start = parseISO(shift.startTime);
        const end = parseISO(shift.endTime);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return total + hours;
      }, 0);
  };

  const nextWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, 1));
  };

  const prevWeek = () => {
    setCurrentWeek(subWeeks(currentWeek, 1));
  };

  const goToToday = () => {
    setCurrentWeek(new Date());
  };

  const getDayLabel = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEEE");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground dark:text-white">My Schedule</h1>
          <p className="text-muted-foreground dark:text-gray-300">
            View your upcoming shifts and work schedule
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={goToToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </h2>
          <Button variant="outline" size="sm" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total Hours This Week</div>
          <div className="text-2xl font-bold text-blue-600">
            {getTotalHoursForWeek().toFixed(1)}h
          </div>
        </div>
      </div>

      {/* Week View Calendar */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {weekDays.map((day) => {
          const shiftsForDay = getShiftsForDay(day);
          const isCurrentDay = isToday(day);
          
          return (
            <Card 
              key={day.toISOString()} 
              className={isCurrentDay ? "ring-2 ring-blue-500 ring-opacity-50" : ""}
            >
              <CardHeader className="pb-3">
                <div className="text-center">
                  <div className="text-sm font-medium text-muted-foreground dark:text-gray-300">
                    {getDayLabel(day)}
                  </div>
                  <div className={`text-lg font-bold ${isCurrentDay ? 'text-blue-600' : ''}`}>
                    {format(day, "d")}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {shiftsForDay.length > 0 ? (
                  <div className="space-y-2">
                    {shiftsForDay.map((shift) => (
                      <div
                        key={shift.id}
                        className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                      >
                        <div className="flex items-center text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {format(parseISO(shift.startTime), 'h:mm a')} - {format(parseISO(shift.endTime), 'h:mm a')}
                        </div>
                        {shift.position && (
                          <div className="flex items-center text-xs text-muted-foreground dark:text-gray-400 mb-1">
                            <User className="h-3 w-3 mr-1" />
                            {shift.position.title}
                          </div>
                        )}
                        {shift.location && (
                          <div className="flex items-center text-xs text-muted-foreground dark:text-gray-400">
                            <MapPin className="h-3 w-3 mr-1" />
                            {shift.location.name}
                          </div>
                        )}
                        {shift.notes && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            {shift.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-gray-400 text-sm">No shifts</div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upcoming Shifts Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Upcoming Shifts
          </CardTitle>
          <CardDescription>
            Your next scheduled shifts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shiftsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {myShifts
                .filter(shift => parseISO(shift.date) >= new Date())
                .slice(0, 5)
                .map((shift) => (
                  <div
                    key={shift.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-muted dark:bg-gray-800"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="text-center">
                        <div className="text-sm font-medium text-muted-foreground dark:text-gray-400">
                          {format(parseISO(shift.date), "EEE")}
                        </div>
                        <div className="text-lg font-bold">
                          {format(parseISO(shift.date), "d")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(shift.date), "MMM")}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">
                          {format(parseISO(shift.startTime), 'h:mm a')} - {format(parseISO(shift.endTime), 'h:mm a')}
                        </div>
                        {shift.position && (
                          <div className="text-sm text-muted-foreground dark:text-gray-400">
                            {shift.position.title}
                          </div>
                        )}
                        {shift.location && (
                          <div className="text-sm text-muted-foreground dark:text-gray-400">
                            📍 {shift.location.name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">
                        {(() => {
                          const start = parseISO(shift.startTime);
                          const end = parseISO(shift.endTime);
                          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                          return `${hours}h`;
                        })()}
                      </Badge>
                      {isToday(parseISO(shift.date)) && (
                        <div className="text-xs text-blue-600 font-medium mt-1">
                          Today
                        </div>
                      )}
                      {isTomorrow(parseISO(shift.date)) && (
                        <div className="text-xs text-green-600 font-medium mt-1">
                          Tomorrow
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              
              {myShifts.filter(shift => parseISO(shift.date) >= new Date()).length === 0 && (
                <div className="text-center py-8">
                  <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-muted-foreground dark:text-gray-300">
                    No upcoming shifts scheduled
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}