import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { 
  FileText, Clock, CheckCircle, AlertTriangle, MessageCircle, 
  Calendar, Target, Upload, Download, Send,
  Bell, Star, TrendingUp, Award
} from "lucide-react";
import { format, isToday, isTomorrow, addDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface EmployeeDocument {
  id: string;
  templateId: string;
  template: {
    name: string;
    type: string;
    description: string;
  };
  status: 'assigned' | 'in_progress' | 'completed' | 'approved' | 'rejected';
  deadline?: string;
  notes?: string;
  assignedAt: string;
  completedAt?: string;
  filePath?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: string;
  assignedAt: string;
}

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  position: string;
  location?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed';
}

interface Message {
  id: string;
  senderId: string;
  sender: {
    firstName: string;
    lastName: string;
    position?: { title: string };
  };
  content: string;
  isRead: boolean;
  createdAt: string;
  type: 'direct' | 'team' | 'announcement';
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const userId = (user as any)?.id || (user as any)?.claims?.sub;
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch employee-specific data
  const { data: assignedDocuments = [] } = useQuery<EmployeeDocument[]>({
    queryKey: [`/api/employees/${userId}/documents`],
    enabled: !!userId,
  });

  const { data: myTasks = [] } = useQuery<Task[]>({
    queryKey: [`/api/employees/${userId}/tasks`],
    enabled: !!userId,
  });

  const { data: myShifts = [] } = useQuery<Shift[]>({
    queryKey: [`/api/employees/${userId}/shifts`],
    enabled: !!userId,
  });

  const { data: recentMessages = [] } = useQuery<Message[]>({
    queryKey: [`/api/employees/${userId}/messages`],
    enabled: !!userId,
  });

  const { data: profile } = useQuery({
    queryKey: [`/api/employees/${userId}/profile`],
    enabled: !!userId,
  });

  // Calculate stats
  const pendingDocuments = assignedDocuments.filter(doc => 
    ['assigned', 'in_progress'].includes(doc.status)
  );
  
  const overdueDocs = assignedDocuments.filter(doc => 
    doc.deadline && new Date(doc.deadline) < new Date() && 
    !['completed', 'approved'].includes(doc.status)
  );

  const todayTasks = myTasks.filter(task => 
    task.dueDate && isToday(new Date(task.dueDate)) && task.status !== 'completed'
  );

  const upcomingShifts = myShifts.filter(shift => {
    const shiftDate = new Date(shift.date);
    return shiftDate >= new Date() && shiftDate <= addDays(new Date(), 7);
  }).slice(0, 5);

  const unreadMessages = recentMessages.filter(msg => !msg.isRead).length;

  const completionRate = assignedDocuments.length > 0 
    ? Math.round((assignedDocuments.filter(doc => ['completed', 'approved'].includes(doc.status)).length / assignedDocuments.length) * 100)
    : 0;

  const getDocumentStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'completed': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'in_progress': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'assigned': return 'bg-accent text-foreground border-border';
      case 'rejected': return 'bg-red-900/30 text-red-400 border border-red-800';
      default: return 'bg-accent text-foreground border-border';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-900/30 text-red-400 border border-red-800';
      case 'high': return 'bg-orange-900/30 text-orange-400 border border-orange-800';
      case 'medium': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'low': return 'bg-green-900/30 text-green-400 border border-green-800';
      default: return 'bg-accent text-foreground border-border';
    }
  };

  const formatShiftTime = (date: string, startTime: string, endTime: string) => {
    const shiftDate = new Date(date);
    if (isToday(shiftDate)) return `Today, ${startTime} - ${endTime}`;
    if (isTomorrow(shiftDate)) return `Tomorrow, ${startTime} - ${endTime}`;
    return `${format(shiftDate, 'MMM d')}, ${startTime} - ${endTime}`;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="welcome-message">
              Welcome back, {(user as any)?.firstName || 'Employee'}!
            </h1>
            <p className="text-blue-100">
              Team Member • Restaurant Team
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-blue-200">Today is</p>
            <p className="text-lg font-semibold">{format(new Date(), 'EEEE, MMM d')}</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-red-900/30 to-red-900/10 border-red-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-500 rounded-lg">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Pending Documents</p>
                <p className="text-2xl font-bold text-red-400">{pendingDocuments.length}</p>
              </div>
            </div>
            {overdueDocs.length > 0 && (
              <div className="mt-2 flex items-center text-red-600">
                <AlertTriangle className="h-4 w-4 mr-1" />
                <span className="text-sm">{overdueDocs.length} overdue</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-900/30 to-orange-900/10 border-orange-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-500 rounded-lg">
                <Target className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Today's Tasks</p>
                <p className="text-2xl font-bold text-orange-400">{todayTasks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border-blue-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Upcoming Shifts</p>
                <p className="text-2xl font-bold text-blue-400">{upcomingShifts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/30 to-green-900/10 border-green-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-500 rounded-lg">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Unread Messages</p>
                <p className="text-2xl font-bold text-green-400">{unreadMessages}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completion Progress */}
      {assignedDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-600" />
              Document Completion Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Completion</span>
                <span className="text-2xl font-bold text-green-600">{completionRate}%</span>
              </div>
              <Progress value={completionRate} className="h-3" />
              <p className="text-sm text-muted-foreground">
                {assignedDocuments.filter(doc => ['completed', 'approved'].includes(doc.status)).length} of {assignedDocuments.length} documents completed
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            {pendingDocuments.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {pendingDocuments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="messages">
            Messages
            {unreadMessages > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {unreadMessages}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Priority Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Priority Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {overdueDocs.length > 0 && (
                  <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                      <span className="font-medium text-red-300">Overdue Documents</span>
                    </div>
                    <p className="text-sm text-red-400 mb-3">
                      You have {overdueDocs.length} document(s) past their deadline
                    </p>
                    <Link href="/employee/documents">
                      <Button size="sm" variant="destructive">View Documents</Button>
                    </Link>
                  </div>
                )}

                {todayTasks.length > 0 && (
                  <div className="p-4 bg-orange-900/20 border border-orange-700/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-5 w-5 text-orange-400" />
                      <span className="font-medium text-orange-300">Today's Tasks</span>
                    </div>
                    <p className="text-sm text-orange-400 mb-3">
                      {todayTasks.length} task(s) due today
                    </p>
                    <Link href="/employee/tasks">
                      <Button size="sm" className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white">View Tasks</Button>
                    </Link>
                  </div>
                )}

                {unreadMessages > 0 && (
                  <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageCircle className="h-5 w-5 text-blue-400" />
                      <span className="font-medium text-blue-300">New Messages</span>
                    </div>
                    <p className="text-sm text-blue-400 mb-3">
                      {unreadMessages} unread message(s)
                    </p>
                    <Link href="/employee/messages">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Read Messages</Button>
                    </Link>
                  </div>
                )}

                {overdueDocs.length === 0 && todayTasks.length === 0 && unreadMessages === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm">No urgent actions needed right now.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Upcoming Shifts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingShifts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No upcoming shifts scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingShifts.map((shift) => (
                      <div key={shift.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{shift.position}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatShiftTime(shift.date, shift.startTime, shift.endTime)}
                          </p>
                          {shift.location && (
                            <p className="text-xs text-muted-foreground">{shift.location}</p>
                          )}
                        </div>
                        <Badge variant="outline" className={
                          shift.status === 'scheduled' ? 'border-blue-200 text-blue-800' :
                          shift.status === 'in_progress' ? 'border-green-200 text-green-800' : 'border-border'
                        }>
                          {shift.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                    <Link href="/hr/scheduling">
                      <Button variant="outline" className="w-full">View Full Schedule</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>My Assigned Documents</CardTitle>
              <Link href="/employee/documents">
                <Button size="sm">View All Documents</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {assignedDocuments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No documents assigned</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assignedDocuments.slice(0, 5).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{doc.template?.name || 'Document'}</h3>
                          <Badge className={getDocumentStatusColor(doc.status)}>
                            {doc.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          {doc.deadline && new Date(doc.deadline) < new Date() && !['completed', 'approved'].includes(doc.status) && (
                            <Badge variant="destructive">Overdue</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{doc.template?.description || 'No description available'}</p>
                        {doc.deadline && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Due: {format(new Date(doc.deadline), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {doc.status === 'assigned' && (
                          <Button size="sm">Start</Button>
                        )}
                        {doc.status === 'in_progress' && (
                          <Button size="sm" variant="outline">Continue</Button>
                        )}
                        {['completed', 'approved'].includes(doc.status) && (
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>My Schedule</CardTitle>
              <Link href="/hr/scheduling">
                <Button size="sm">View Full Calendar</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {upcomingShifts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No upcoming shifts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingShifts.map((shift) => (
                    <div key={shift.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{shift.position}</h3>
                        <Badge variant="outline">
                          {shift.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatShiftTime(shift.date, shift.startTime, shift.endTime)}
                      </p>
                      {shift.location && (
                        <p className="text-xs text-muted-foreground mt-1">{shift.location}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Messages</CardTitle>
              <div className="flex gap-2">
                <Link href="/employee/messages">
                  <Button size="sm" variant="outline">View All</Button>
                </Link>
                <Link href="/employee/messages/compose">
                  <Button size="sm">
                    <Send className="h-4 w-4 mr-1" />
                    Compose
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No messages</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentMessages.slice(0, 5).map((message) => (
                    <div key={message.id} className={`p-4 border rounded-lg ${!message.isRead ? 'bg-blue-900/20 border-blue-700/50' : 'hover:bg-accent'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">
                            {message.sender.firstName} {message.sender.lastName}
                            {message.sender.position && (
                              <span className="text-sm text-muted-foreground font-normal ml-2">
                                {message.sender.position.title}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={message.type === 'announcement' ? 'default' : 'outline'} className="text-xs">
                            {message.type.toUpperCase()}
                          </Badge>
                          {!message.isRead && (
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">{message.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/employee/timeclock">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-blue-600" />
              <p className="font-medium">Time Clock</p>
              <p className="text-sm text-muted-foreground">Clock in/out</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/employee/time-off">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6 text-center">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-green-600" />
              <p className="font-medium">Request Time Off</p>
              <p className="text-sm text-muted-foreground">Submit PTO request</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/employee/messages/compose">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6 text-center">
              <Send className="h-8 w-8 mx-auto mb-2 text-purple-600" />
              <p className="font-medium">Send Message</p>
              <p className="text-sm text-muted-foreground">Contact team/manager</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}