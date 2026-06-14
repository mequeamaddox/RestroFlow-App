import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { 
  MessageCircle, Send, Reply, Users, User, Crown, 
  Calendar, Search, Plus, Eye, ArrowLeft, Filter,
  Megaphone, Mail, Phone, Clock, CheckCheck
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

interface Message {
  id: string;
  senderId: string;
  sender: {
    firstName: string;
    lastName: string;
    position?: { title: string };
    department?: { name: string };
  };
  recipientId?: string;
  recipient?: {
    firstName: string;
    lastName: string;
    position?: { title: string };
  };
  subject: string;
  content: string;
  type: 'direct' | 'team' | 'announcement';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  parentId?: string;
  replies?: Message[];
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  position?: { title: string };
  department?: { name: string };
}

export default function EmployeeMessages() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Fix user ID access - try both patterns for compatibility
  const userId = user?.id || (user as any)?.claims?.sub;
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch messages (use unified HR messages API)
  const { data: allMessages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['/api/hr/messages'],
    enabled: !!userId,
  });
  
  // Filter messages relevant to this employee
  const messages = allMessages.filter(message => 
    message.senderId === userId || // Messages sent by this user
    message.recipientId === userId || // Direct messages to this user
    message.type === 'announcement' || // All announcements
    message.type === 'team' // All team messages
  );

  // Fetch employees for compose
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees'],
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: {
      recipientId?: string;
      recipientType: 'individual' | 'team' | 'managers';
      subject: string;
      content: string;
      priority: string;
      parentId?: string;
    }) => {
      return await apiRequest('POST', '/api/hr/messages', data);
    },
    onSuccess: () => {
      toast({
        title: "Message Sent",
        description: "Your message has been sent successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hr/messages'] });
      setShowCompose(false);
      setReplyingTo(null);
      setSelectedMessage(null);
    },
    onError: () => {
      toast({
        title: "Send Failed",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return await apiRequest('PUT', `/api/hr/messages/${messageId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/messages'] });
    },
  });

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const messageData = {
      recipientId: formData.get('recipientId') as string || undefined,
      recipientType: formData.get('recipientType') as 'individual' | 'team' | 'managers',
      subject: formData.get('subject') as string,
      content: formData.get('content') as string,
      priority: formData.get('priority') as string,
      parentId: replyingTo?.id,
    };

    sendMessageMutation.mutate(messageData);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    setShowCompose(true);
  };

  const handleViewMessage = (message: Message) => {
    setSelectedMessage(message);
    if (!message.isRead) {
      markAsReadMutation.mutate(message.id);
    }
  };

  const filteredMessages = messages.filter(message => {
    const matchesSearch = searchTerm === '' || 
      message.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${message.sender.firstName} ${message.sender.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());

    if (filter === 'all') return matchesSearch;
    if (filter === 'unread') return matchesSearch && !message.isRead;
    if (filter === 'sent') return matchesSearch && message.senderId === userId;
    return matchesSearch && message.type === filter;
  });

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'announcement': return <Megaphone className="h-4 w-4 text-blue-600" />;
      case 'team': return <Users className="h-4 w-4 text-green-600" />;
      case 'direct': return <User className="h-4 w-4 text-purple-600" />;
      default: return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-900/30 text-red-400 border border-red-800';
      case 'high': return 'bg-orange-900/30 text-orange-400 border border-orange-800';
      case 'normal': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'low': return 'bg-accent text-foreground border-border';
      default: return 'bg-accent text-foreground border-border';
    }
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
    return format(date, 'MMM d, h:mm a');
  };

  const stats = {
    total: messages.length,
    unread: messages.filter(msg => !msg.isRead).length,
    sent: messages.filter(msg => msg.senderId === userId).length,
    announcements: messages.filter(msg => msg.type === 'announcement').length,
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="page-title">Messages</h1>
          <p className="text-muted-foreground">Communicate with your team and managers</p>
        </div>
        <Button onClick={() => setShowCompose(true)} data-testid="button-compose-message">
          <Plus className="w-4 h-4 mr-2" />
          New Message
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center">
              <MessageCircle className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Messages</p>
                <p className="text-2xl font-bold text-blue-400">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-900/30 to-orange-900/10 border-orange-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Mail className="h-8 w-8 text-orange-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold text-orange-400">{stats.unread}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/30 to-green-900/10 border-green-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Send className="h-8 w-8 text-green-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Sent</p>
                <p className="text-2xl font-bold text-green-400">{stats.sent}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-900/30 to-purple-900/10 border-purple-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Megaphone className="h-8 w-8 text-purple-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Announcements</p>
                <p className="text-2xl font-bold text-purple-400">{stats.announcements}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search messages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-messages"
                />
              </div>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-48" data-testid="select-message-filter">
                <SelectValue placeholder="Filter messages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Messages</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="sent">Sent by Me</SelectItem>
                <SelectItem value="direct">Direct Messages</SelectItem>
                <SelectItem value="team">Team Messages</SelectItem>
                <SelectItem value="announcement">Announcements</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Messages List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {filter === 'all' ? 'All Messages' : 
             filter === 'unread' ? 'Unread Messages' :
             filter === 'sent' ? 'Sent Messages' :
             (filter?.charAt(0)?.toUpperCase() || '') + (filter?.slice(1) || '') + ' Messages'}
            {filteredMessages.length > 0 && (
              <Badge variant="outline">({filteredMessages.length})</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-foreground mb-2">No messages found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No messages match your search criteria.' : 
                 filter === 'unread' ? 'All caught up! No unread messages.' :
                 'No messages in this category.'}
              </p>
              {searchTerm === '' && filter === 'all' && (
                <Button onClick={() => setShowCompose(true)}>
                  <Send className="w-4 h-4 mr-2" />
                  Send Your First Message
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => handleViewMessage(message)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                    !message.isRead ? 'bg-blue-900/20 border-blue-700/50' : 'hover:bg-accent'
                  } ${selectedMessage?.id === message.id ? 'ring-2 ring-blue-500' : ''}`}
                  data-testid={`message-item-${message.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {getMessageTypeIcon(message.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`font-medium truncate ${!message.isRead ? 'font-semibold' : ''}`}>
                          {message.senderId === userId ? (
                            <>To: {message.recipient ? `${message.recipient.firstName} ${message.recipient.lastName}` : 'Team'}</>
                          ) : (
                            `${message.sender.firstName} ${message.sender.lastName}`
                          )}
                        </p>
                        {message.sender?.position?.title && (
                          <span className="text-xs text-muted-foreground">• {message.sender.position.title}</span>
                        )}
                        {message.priority !== 'normal' && (
                          <Badge className={getPriorityColor(message.priority)} variant="outline">
                            {message.priority?.toUpperCase() || 'NORMAL'}
                          </Badge>
                        )}
                        {!message.isRead && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        )}
                      </div>
                      
                      <p className={`text-sm truncate mb-1 ${!message.isRead ? 'font-medium' : 'text-foreground'}`}>
                        {message.subject}
                      </p>
                      
                      <p className="text-sm text-muted-foreground truncate mb-2">
                        {message.content}
                      </p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatMessageTime(message.createdAt)}</span>
                          {message.isRead && message.readAt && (
                            <>
                              <CheckCheck className="h-3 w-3 text-green-500" />
                              <span className="text-green-600">Read</span>
                            </>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {message.type?.toUpperCase() || 'DIRECT'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose Dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {replyingTo ? <Reply className="h-5 w-5" /> : <Send className="h-5 w-5" />}
              {replyingTo ? 'Reply to Message' : 'New Message'}
            </DialogTitle>
          </DialogHeader>
          
          {replyingTo && (
            <div className="p-4 bg-muted border border-border rounded-lg mb-4">
              <p className="text-sm font-medium">Replying to:</p>
              <p className="text-sm text-foreground">"{replyingTo.subject}"</p>
              <p className="text-xs text-muted-foreground">
                From: {replyingTo.sender.firstName} {replyingTo.sender.lastName}
              </p>
            </div>
          )}

          <form onSubmit={handleSendMessage} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="recipientType">Send To</Label>
                <Select name="recipientType" defaultValue="individual" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select recipient type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual Employee</SelectItem>
                    <SelectItem value="managers">My Managers</SelectItem>
                    <SelectItem value="team">Team/Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="recipientId">Specific Person (if individual)</Label>
                <Select name="recipientId">
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees
                      .filter(emp => emp.id !== userId)
                      .map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName}
                        {employee.position?.title && ` - ${employee.position.title}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  name="subject"
                  placeholder="Enter subject..."
                  defaultValue={replyingTo ? `Re: ${replyingTo.subject}` : ''}
                  required
                  data-testid="input-message-subject"
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select name="priority" defaultValue="normal">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="content">Message</Label>
              <Textarea
                name="content"
                placeholder="Type your message here..."
                rows={6}
                required
                data-testid="textarea-message-content"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCompose(false);
                  setReplyingTo(null);
                }}
                data-testid="button-cancel-message"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={sendMessageMutation.isPending}
                data-testid="button-send-message"
              >
                {sendMessageMutation.isPending ? 'Sending...' : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Message
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Message Details Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedMessage && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <DialogTitle className="flex items-center gap-2 mb-2">
                      {getMessageTypeIcon(selectedMessage.type)}
                      {selectedMessage.subject}
                    </DialogTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {selectedMessage.senderId === userId ? 'You' : 
                         `${selectedMessage.sender.firstName} ${selectedMessage.sender.lastName}`}
                      </span>
                      {selectedMessage.sender?.position?.title && (
                        <>
                          <span>•</span>
                          <span>{selectedMessage.sender.position.title}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{format(new Date(selectedMessage.createdAt), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getPriorityColor(selectedMessage.priority)}>
                      {selectedMessage.priority?.toUpperCase() || 'NORMAL'}
                    </Badge>
                    <Badge variant="outline">
                      {selectedMessage.type?.toUpperCase() || 'DIRECT'}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedMessage.content}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setSelectedMessage(null)}>
                    Close
                  </Button>
                  {selectedMessage.senderId !== userId && (
                    <Button onClick={() => handleReply(selectedMessage)}>
                      <Reply className="w-4 h-4 mr-2" />
                      Reply
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}