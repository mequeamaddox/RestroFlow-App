import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, CheckSquare, Calendar, MessageSquare, TrendingUp, DollarSign, Target, Activity, Briefcase, UserCheck, Timer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import type { Employee } from "@shared/schema";

interface HRAnalytics {
  totalEmployees: number;
  activeEmployees: number;
  currentlyWorking: number;
  todayShifts: number;
  pendingTasks: number;
  unreadMessages: number;
  pendingTimeOff: number;
  approvedTimeOff: number;
  weeklyShifts: number;
  totalWeeklyHours: number;
  actualWeeklyHours: number;
  actualWeeklyLabor: number;
  taskCompletionRate: number;
  avgHourlyRate: number;
  estimatedWeeklyLabor: number;
  recentMessages: any[];
  upcomingShifts: any[];
}

export default function HRAnalytics() {
  const { currentLocation, hasHRAccess } = useLocation();
  
  const { data: analytics, isLoading } = useQuery<HRAnalytics>({
    queryKey: ['/api/hr/analytics', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    enabled: !!currentLocation,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-96 mb-6"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 rounded-lg h-32"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Calculate metrics
  const totalEmployees = analytics?.totalEmployees || employees.length;
  const activeEmployees = analytics?.activeEmployees || employees.filter((emp: any) => emp.status === 'active').length;
  const currentlyWorking = analytics?.currentlyWorking || 0;
  const weeklyHours = analytics?.totalWeeklyHours || 0;
  const pendingTasks = analytics?.pendingTasks || 0;
  const todayShifts = analytics?.todayShifts || 0;
  const taskCompletionRate = analytics?.taskCompletionRate || 0;

  // Labor cost calculations - use scheduled labor from backend
  const weeklyLaborCost = analytics?.estimatedWeeklyLabor || 0;
  const monthlyLaborCost = weeklyLaborCost * 4.33;

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="max-w-7xl mx-auto p-6" data-testid="hr-analytics">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-foreground dark:text-white">HR Analytics & Performance</h1>
        <p className="text-muted-foreground dark:text-gray-400">Real-time insights into your team's performance and labor metrics</p>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 dark:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold">LIVE</div>
            <span className="text-blue-700 dark:text-blue-300 font-medium">Real-time Employee Analytics</span>
          </div>
          <p className="text-blue-600 dark:text-blue-400 text-sm mt-1">
            Live tracking of labor costs, productivity, and team performance
          </p>
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 border-blue-200 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">Active Team Size</CardTitle>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">{activeEmployees}</div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Active employees
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">Currently Working</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-800 dark:text-green-200">{currentlyWorking}</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-xs text-green-600 dark:text-green-400">Live status</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950 border-purple-200 dark:border-purple-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">Weekly Hours</CardTitle>
            <Timer className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-800 dark:text-purple-200">{weeklyHours.toFixed(1)}h</div>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              {employees.length > 0 ? (weeklyHours / employees.length).toFixed(1) : '0'} hrs/employee avg
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border-orange-200 dark:border-orange-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">Task Completion</CardTitle>
            <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-800 dark:text-orange-200">{taskCompletionRate.toFixed(0)}%</div>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              {pendingTasks} pending tasks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Labor Cost Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Weekly Labor Cost
            </CardTitle>
            <CardDescription>Current week projected costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">${weeklyLaborCost.toFixed(0)}</div>
            <div className="mt-4">
              <div className="flex justify-between text-sm">
                <span>Hours worked</span>
                <span>{weeklyHours.toFixed(1)}h</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-green-500 h-2 rounded-full" 
                  style={{ width: `${Math.min((weeklyHours / 160) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Monthly Projection
            </CardTitle>
            <CardDescription>Estimated monthly labor costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">${monthlyLaborCost.toFixed(0)}</div>
            <p className="text-sm text-muted-foreground mt-1">
              Based on current trends
            </p>
            <div className="flex items-center gap-2 mt-4">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-blue-600">On track for budget</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              Productivity Metrics
            </CardTitle>
            <CardDescription>Team efficiency indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Task Completion Rate</span>
                <span>{taskCompletionRate.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-purple-500 dark:bg-purple-600 h-2 rounded-full" 
                  style={{ width: `${taskCompletionRate}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Activity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Today's Activity</CardTitle>
            <CardDescription>Current shift and attendance overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Scheduled Shifts</span>
                </div>
                <Badge variant="outline">{todayShifts}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Currently Clocked In</span>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  {currentlyWorking}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-orange-500" />
                  <span className="text-sm">Pending Tasks</span>
                </div>
                <Badge variant="outline" className="text-orange-600 border-orange-200">
                  {pendingTasks}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
            <CardDescription>Key performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Employee Utilization</span>
                  <span className="text-sm text-muted-foreground">
                    {totalEmployees > 0 ? ((currentlyWorking / totalEmployees) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-500 h-3 rounded-full transition-all duration-500" 
                    style={{ width: `${totalEmployees > 0 ? (currentlyWorking / totalEmployees) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Average Hours/Employee</span>
                  <span className="text-sm text-muted-foreground">
                    {employees.length > 0 ? (weeklyHours / employees.length).toFixed(1) : '0'} hrs/week
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600 font-medium">System Status: Optimal</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}