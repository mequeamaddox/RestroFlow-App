import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
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
import { MessageSquare, Send, Bell, Users, Megaphone, Clock, Eye, FileText, Upload, Download, Trash2, Folder } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useLocation } from "@/contexts/LocationContext";

interface Message {
  id: string;
  title: string;
  content: string;
  messageType: 'announcement' | 'direct' | 'department' | 'urgent';
  recipientType: 'all' | 'department' | 'individual';
  recipientId?: string;
  senderId: string;
  isRead: boolean;
  createdAt: string;
  readBy?: Array<{
    userId: string;
    readAt: string;
  }>;
}

interface TeamResource {
  id: string;
  name: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  category: 'document' | 'form' | 'recipe' | 'policy' | 'manual' | 'other';
  uploadedBy: string;
  uploadedAt: string;
}

export default function HRMessaging() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [messageTypeFilter, setMessageTypeFilter] = useState<string>("all");
  const [resourceCategoryFilter, setResourceCategoryFilter] = useState<string>("all");
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentLocation, hasHRAccess } = useLocation();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['/api/hr/messages'],
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['/api/hr/employees'],
  });

  const { data: departments = [] } = useQuery({
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

  const { data: teamResources = [] } = useQuery({
    queryKey: ['/api/hr/team-resources'],
  });

  const createMessageMutation = useMutation({
    mutationFn: async (messageData: any) => {
      return await apiRequest('POST', '/api/hr/messages', messageData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Message sent successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/messages'] });
      setIsCreateDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    },
  });

  const createResourceMutation = useMutation({
    mutationFn: async (resourceData: any) => {
      return await apiRequest('POST', '/api/hr/team-resources', resourceData);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Resource uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/team-resources'] });
      setIsResourceDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload resource", variant: "destructive" });
    },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/hr/team-resources/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Resource deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/team-resources'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete resource", variant: "destructive" });
    },
  });

  const filteredMessages = messages.filter((message: Message) => {
    const matchesType = messageTypeFilter === "all" || message.messageType === messageTypeFilter;
    return matchesType;
  });

  const filteredResources = teamResources.filter((resource: TeamResource) => {
    const matchesCategory = resourceCategoryFilter === "all" || resource.category === resourceCategoryFilter;
    return matchesCategory;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const messageData = {
      title: formData.get('title'),
      content: formData.get('content'),
      messageType: formData.get('messageType') || 'announcement',
      recipientType: formData.get('recipientType') || 'all',
      recipientId: formData.get('recipientId') === 'none' ? null : formData.get('recipientId'),
      priority: formData.get('priority') || 'normal',
    };

    createMessageMutation.mutate(messageData);
  };

  const handleResourceUpload = async () => {
    return await apiRequest('POST', '/api/objects/upload');
  };

  const handleResourceComplete = (result: any) => {
    if (result.successful?.[0]?.uploadURL) {
      // This would normally open a dialog to collect metadata
      toast({ title: "Upload Complete", description: "Please add resource details" });
      setIsResourceDialogOpen(true);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'document': return <FileText className="h-4 w-4" />;
      case 'form': return <FileText className="h-4 w-4" />;
      case 'recipe': return <FileText className="h-4 w-4" />;
      case 'policy': return <FileText className="h-4 w-4" />;
      case 'manual': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'document': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'form': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'recipe': return 'bg-orange-900/30 text-orange-400 border border-orange-800';
      case 'policy': return 'bg-red-900/30 text-red-400 border border-red-800';
      case 'manual': return 'bg-purple-900/30 text-purple-400 border border-purple-800';
      default: return 'bg-accent text-foreground';
    }
  };

  const getMessageTypeColor = (messageType: string) => {
    switch (messageType) {
      case 'announcement': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'direct': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'department': return 'bg-purple-900/30 text-purple-400 border border-purple-800';
      case 'urgent': return 'bg-red-900/30 text-red-400 border border-red-800';
      default: return 'bg-accent text-foreground';
    }
  };

  const getMessageTypeIcon = (messageType: string) => {
    switch (messageType) {
      case 'announcement': return <Megaphone className="h-4 w-4" />;
      case 'direct': return <MessageSquare className="h-4 w-4" />;
      case 'department': return <Users className="h-4 w-4" />;
      case 'urgent': return <Bell className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getRecipientDisplay = (message: Message) => {
    if (message.recipientType === 'all') {
      return 'All Employees';
    } else if (message.recipientType === 'department') {
      const dept = departments.find((d: any) => d.id === message.recipientId);
      return dept ? `${dept.name} Department` : 'Department';
    } else if (message.recipientType === 'individual') {
      const emp = employees.find((e: any) => e.id === message.recipientId);
      return emp ? `${emp.firstName} ${emp.lastName}` : 'Individual';
    }
    return 'Unknown';
  };

  const getReadCount = (message: Message) => {
    if (!message.readBy) return 0;
    return message.readBy.length;
  };

  const getTotalRecipients = (message: Message) => {
    if (message.recipientType === 'all') {
      return employees.length;
    } else if (message.recipientType === 'department') {
      return employees.filter((emp: any) => emp.departmentId === message.recipientId).length;
    } else if (message.recipientType === 'individual') {
      return 1;
    }
    return 0;
  };

  const getMessagesByType = (messageType: string) => {
    return messages.filter((message: Message) => message.messageType === messageType).length;
  };

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

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Team Communication & Resources</h1>
        <p className="text-muted-foreground">Send messages to your team and manage shared documents, forms, and resources</p>
      </div>

      <Tabs defaultValue="messages" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="messages" data-testid="tab-messages">
            <MessageSquare className="h-4 w-4 mr-2" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="resources" data-testid="tab-resources">
            <Folder className="h-4 w-4 mr-2" />
            Team Resources
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="space-y-6 mt-6">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <MessageSquare className="h-6 w-6" />
                  Team Messages
                </h2>
                <p className="text-muted-foreground">Send announcements and messages to your team</p>
              </div>
              
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Send className="h-4 w-4 mr-2" />
                Send Message
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Send Message</DialogTitle>
                  <DialogDescription>
                    Create a new message or announcement for your team
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Message Title</Label>
                    <Input
                      id="title"
                      name="title"
                      placeholder="Enter message title..."
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="content">Message Content</Label>
                    <Textarea
                      id="content"
                      name="content"
                      placeholder="Type your message here..."
                      rows={6}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="messageType">Message Type</Label>
                      <Select name="messageType" defaultValue="announcement">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="announcement">📢 Announcement</SelectItem>
                          <SelectItem value="direct">💬 Direct Message</SelectItem>
                          <SelectItem value="department">🏢 Department</SelectItem>
                          <SelectItem value="urgent">🔔 Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="recipientType">Send To</Label>
                      <Select name="recipientType" defaultValue="all">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Employees</SelectItem>
                          <SelectItem value="department">Specific Department</SelectItem>
                          <SelectItem value="individual">Individual Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="recipientId">Recipient (if specific)</Label>
                    <Select name="recipientId">
                      <SelectTrigger>
                        <SelectValue placeholder="Select recipient..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (All Employees)</SelectItem>
                        {departments.map((dept: any) => (
                          <SelectItem key={`dept-${dept.id}`} value={dept.id}>
                            🏢 {dept.name}
                          </SelectItem>
                        ))}
                        {employees.map((employee: any) => (
                          <SelectItem key={`emp-${employee.id}`} value={employee.id}>
                            👤 {employee.firstName} {employee.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select name="priority" defaultValue="normal">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">🟢 Low Priority</SelectItem>
                        <SelectItem value="normal">🟡 Normal</SelectItem>
                        <SelectItem value="high">🔴 High Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button type="submit" disabled={createMessageMutation.isPending}>
                    <Send className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Message Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Announcements</p>
                  <p className="text-2xl font-bold">{getMessagesByType('announcement')}</p>
                </div>
                <div className="bg-blue-900/30 p-2 rounded-full">
                  <Megaphone className="h-4 w-4 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Direct Messages</p>
                  <p className="text-2xl font-bold">{getMessagesByType('direct')}</p>
                </div>
                <div className="bg-green-900/30 p-2 rounded-full">
                  <MessageSquare className="h-4 w-4 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Department Messages</p>
                  <p className="text-2xl font-bold">{getMessagesByType('department')}</p>
                </div>
                <div className="bg-purple-900/30 p-2 rounded-full">
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Urgent Messages</p>
                  <p className="text-2xl font-bold">{getMessagesByType('urgent')}</p>
                </div>
                <div className="bg-red-900/30 p-2 rounded-full">
                  <Bell className="h-4 w-4 text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Message Type Filter */}
        <div className="mt-6">
          <Select value={messageTypeFilter} onValueChange={setMessageTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Messages</SelectItem>
              <SelectItem value="announcement">📢 Announcements</SelectItem>
              <SelectItem value="direct">💬 Direct Messages</SelectItem>
              <SelectItem value="department">🏢 Department Messages</SelectItem>
              <SelectItem value="urgent">🔔 Urgent Messages</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Messages List */}
      <div className="space-y-4">
        {filteredMessages.map((message: Message) => {
          const readCount = getReadCount(message);
          const totalRecipients = getTotalRecipients(message);
          const readPercentage = totalRecipients > 0 ? Math.round((readCount / totalRecipients) * 100) : 0;

          return (
            <Card key={message.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getMessageTypeColor(message.messageType)}>
                        {getMessageTypeIcon(message.messageType)}
                        <span className="ml-1 capitalize">{message.messageType}</span>
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        • {getRecipientDisplay(message)}
                      </span>
                    </div>
                    <CardTitle className="text-xl">{message.title}</CardTitle>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(message.createdAt).toLocaleDateString()} at {new Date(message.createdAt).toLocaleTimeString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        {readCount} of {totalRecipients} read ({readPercentage}%)
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="bg-muted rounded-lg p-4 mb-4">
                  <p className="text-foreground whitespace-pre-wrap">{message.content}</p>
                </div>
                
                {/* Read Status Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Read Status</span>
                    <span>{readCount}/{totalRecipients} employees</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${readPercentage}%` }}
                    ></div>
                  </div>
                </div>

                {/* Recent Readers */}
                {message.readBy && message.readBy.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Recent readers:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.readBy.slice(0, 5).map((reader: any, index: number) => {
                        const employee = employees.find((emp: any) => emp.id === reader.userId);
                        return (
                          <div key={index} className="flex items-center gap-1 text-xs bg-accent rounded-full px-2 py-1">
                            {employee && (
                              <>
                                <Avatar className="h-4 w-4">
                                  <AvatarImage src={employee.profilePhoto} />
                                  <AvatarFallback className="text-xs">
                                    {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{employee.firstName} {employee.lastName}</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {message.readBy.length > 5 && (
                        <span className="text-xs text-muted-foreground px-2 py-1">
                          +{message.readBy.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredMessages.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No messages found</h3>
          <p className="text-muted-foreground mb-4">
            {messageTypeFilter !== "all"
              ? "Try changing your message type filter"
              : "Send your first message to get started"
            }
          </p>
          {messageTypeFilter === "all" && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              Send First Message
            </Button>
          )}
        </div>
      )}
        </TabsContent>

        <TabsContent value="resources" className="space-y-6 mt-6">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Folder className="h-6 w-6" />
                  Team Resources
                </h2>
                <p className="text-muted-foreground">Manage documents, forms, recipes, and other shared files</p>
              </div>
              
              <ObjectUploader
                maxNumberOfFiles={1}
                maxFileSize={52428800}
                onGetUploadParameters={handleResourceUpload}
                onComplete={handleResourceComplete}
                buttonClassName=""
                data-testid="button-upload-resource"
              >
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload File
                </div>
              </ObjectUploader>
            </div>
          </div>

          {/* Resource filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Label htmlFor="resource-category-filter">Filter by Category</Label>
              <Select value={resourceCategoryFilter} onValueChange={setResourceCategoryFilter}>
                <SelectTrigger id="resource-category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="document">📄 Documents</SelectItem>
                  <SelectItem value="form">📋 Forms</SelectItem>
                  <SelectItem value="recipe">🍽️ Recipes</SelectItem>
                  <SelectItem value="policy">📖 Policies</SelectItem>
                  <SelectItem value="manual">📚 Manuals</SelectItem>
                  <SelectItem value="other">📁 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resources grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredResources.map((resource: TeamResource) => {
              const employee = employees.find((emp: any) => emp.id === resource.uploadedBy);
              return (
                <Card key={resource.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(resource.category)}
                        <Badge className={getCategoryColor(resource.category)}>
                          {resource.category}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteResourceMutation.mutate(resource.id)}
                        data-testid={`button-delete-${resource.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-medium text-foreground" data-testid={`text-resource-name-${resource.id}`}>
                          {resource.name}
                        </h3>
                        {resource.description && (
                          <p className="text-sm text-muted-foreground mt-1">{resource.description}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{formatFileSize(resource.fileSize)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(resource.fileUrl, '_blank')}
                          data-testid={`button-download-${resource.id}`}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={employee?.profilePhoto} />
                          <AvatarFallback className="text-xs">
                            {employee?.firstName?.charAt(0)}{employee?.lastName?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown User'}
                        </span>
                        <span>•</span>
                        <Clock className="h-3 w-3" />
                        <span>{new Date(resource.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredResources.length === 0 && (
            <div className="text-center py-12">
              <Folder className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No resources found</h3>
              <p className="text-muted-foreground mb-4">
                {resourceCategoryFilter !== "all"
                  ? "Try changing your category filter"
                  : "Upload your first team resource to get started"
                }
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}