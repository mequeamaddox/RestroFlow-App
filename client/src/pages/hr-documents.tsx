import { HRUpgradePrompt } from "@/components/hr/hr-upgrade-prompt";
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ObjectUploader } from '@/components/ObjectUploader';
import { 
  FileText, Upload, CheckCircle, Clock, AlertTriangle, Users, 
  Calendar, Download, Eye, Trash2, Plus,
  Award, User, Send, Zap
} from 'lucide-react';
import { DocumentAssignmentWizard } from '@/components/hr/DocumentAssignmentWizard';
import InviteEmployeeDialog from '@/components/hr/InviteEmployeeDialog';
import { format } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from '@/contexts/LocationContext';
import type { 
  EmployeeDocument, Employee, OnboardingTemplate, EmployeeOnboarding 
} from '@shared/schema';

interface DocumentFormData {
  employeeId: string;
  documentType: string;
  documentName: string;
  isRequired: boolean;
}

interface OnboardingFormData {
  employeeId: string;
  templateId: string;
  startDate: string;
  targetCompletionDate: string;
  assignedMentorId?: string;
}

export default function HRDocumentsPage() {
  const { toast } = useToast();
  const { currentLocation, hasHRAccess } = useLocation();
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [documentFilter, setDocumentFilter] = useState<string>('all');
  const [onboardingFilter, setOnboardingFilter] = useState<string>('all');
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [showAssignmentWizard, setShowAssignmentWizard] = useState(false);

  // Upload Document form state
  const [uploadEmployeeId, setUploadEmployeeId] = useState('');
  const [uploadDocumentType, setUploadDocumentType] = useState('');
  const [uploadDocumentName, setUploadDocumentName] = useState('');
  const [uploadIsRequired, setUploadIsRequired] = useState(false);

  // Start Onboarding form state
  const [onboardingEmployeeId, setOnboardingEmployeeId] = useState('');
  const [onboardingTemplateId, setOnboardingTemplateId] = useState('');
  const [onboardingStartDate, setOnboardingStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [onboardingTargetDate, setOnboardingTargetDate] = useState('');
  const [onboardingMentorId, setOnboardingMentorId] = useState('');

  // Fetch data
  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: documents } = useQuery<EmployeeDocument[]>({
    queryKey: ['/api/hr/documents', selectedEmployee],
    enabled: !!selectedEmployee,
  });

  const { data: onboardingTemplates } = useQuery<OnboardingTemplate[]>({
    queryKey: ['/api/hr/onboarding/templates', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: employeeOnboarding } = useQuery<EmployeeOnboarding[]>({
    queryKey: ['/api/hr/onboarding', selectedEmployee],
    enabled: !!selectedEmployee,
  });

  const { data: onboardingAnalytics } = useQuery<{
    totalActiveOnboarding: number;
    completedThisMonth: number;
    overdueOnboarding: number;
    averageCompletionDays: number;
  }>({
    queryKey: ['/api/hr/onboarding/analytics', currentLocation?.id],
    enabled: !!currentLocation,
  });

  // Document upload mutation
  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: DocumentFormData & { filePath: string; fileSize: number; mimeType: string }) => {
      return await apiRequest('POST', '/api/hr/documents', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hr/documents'] });
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      setShowDocumentDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const handleDocumentUpload = async (result: any) => {
    const uploadedFile = result.successful[0];
    if (uploadedFile && uploadEmployeeId && uploadDocumentType && uploadDocumentName) {
      uploadDocumentMutation.mutate({
        employeeId: uploadEmployeeId,
        documentType: uploadDocumentType,
        documentName: uploadDocumentName,
        isRequired: uploadIsRequired,
        filePath: uploadedFile.uploadURL,
        fileSize: uploadedFile.size || 0,
        mimeType: uploadedFile.type || 'application/octet-stream',
      });
      // Reset form state
      setUploadEmployeeId('');
      setUploadDocumentType('');
      setUploadDocumentName('');
      setUploadIsRequired(false);
    } else {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
    }
  };

  const handleStartOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    if (onboardingEmployeeId && onboardingTemplateId && onboardingStartDate && onboardingTargetDate) {
      apiRequest('POST', '/api/hr/onboarding', {
        employeeId: onboardingEmployeeId,
        templateId: onboardingTemplateId,
        startDate: onboardingStartDate,
        targetCompletionDate: onboardingTargetDate,
        assignedMentorId: onboardingMentorId || undefined,
        locationId: currentLocation?.id,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/hr/onboarding'] });
        toast({
          title: "Success",
          description: "Onboarding process started successfully",
        });
        setShowOnboardingDialog(false);
        // Reset form state
        setOnboardingEmployeeId('');
        setOnboardingTemplateId('');
        setOnboardingStartDate(format(new Date(), 'yyyy-MM-dd'));
        setOnboardingTargetDate('');
        setOnboardingMentorId('');
      }).catch(() => {
        toast({
          title: "Error",
          description: "Failed to start onboarding",
          variant: "destructive",
        });
      });
    } else {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
    }
  };

  const getDocumentStatusColor = (status: string | null) => {
    switch (status) {
      case 'approved': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'uploaded': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'required': return 'bg-red-900/30 text-red-400 border border-red-800';
      case 'rejected': return 'bg-orange-900/30 text-orange-400 border border-orange-800';
      default: return 'bg-accent text-foreground';
    }
  };

  const getOnboardingStatusColor = (status: string | null) => {
    switch (status) {
      case 'completed': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'in-progress': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'overdue': return 'bg-red-900/30 text-red-400 border border-red-800';
      case 'not-started': return 'bg-accent text-foreground';
      default: return 'bg-accent text-foreground';
    }
  };

  const filteredDocuments = documents?.filter(doc => {
    if (documentFilter === 'all') return true;
    return doc.status === documentFilter;
  }) || [];

  const filteredOnboarding = employeeOnboarding?.filter(onb => {
    if (onboardingFilter === 'all') return true;
    return onb.status === onboardingFilter;
  }) || [];

  if (!hasHRAccess) return <HRUpgradePrompt locationName={currentLocation?.name || "this location"} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Employee Documents & Onboarding</h1>
          <p className="text-muted-foreground mt-2">Manage employee documents and onboarding processes</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowAssignmentWizard(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            data-testid="button-assignment-wizard"
          >
            <Zap className="w-4 h-4 mr-2" />
            Assignment Wizard
          </Button>
          
          <Dialog open={showDocumentDialog} onOpenChange={setShowDocumentDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-document">
                <Upload className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Employee Document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="employeeId">Employee</Label>
                  <Select value={uploadEmployeeId} onValueChange={setUploadEmployeeId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="documentType">Document Type</Label>
                  <Select value={uploadDocumentType} onValueChange={setUploadDocumentType} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identification">ID/License</SelectItem>
                      <SelectItem value="tax-forms">Tax Forms (W-4, I-9)</SelectItem>
                      <SelectItem value="emergency-contact">Emergency Contact</SelectItem>
                      <SelectItem value="bank-info">Banking Information</SelectItem>
                      <SelectItem value="employment-agreement">Employment Agreement</SelectItem>
                      <SelectItem value="handbook">Employee Handbook</SelectItem>
                      <SelectItem value="training-certificate">Training Certificate</SelectItem>
                      <SelectItem value="performance-review">Performance Review</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="documentName">Document Name</Label>
                  <Input 
                    value={uploadDocumentName} 
                    onChange={(e) => setUploadDocumentName(e.target.value)}
                    placeholder="Enter document name" 
                    required 
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="isRequired"
                    checked={uploadIsRequired} 
                    onCheckedChange={(checked) => setUploadIsRequired(checked === true)}
                  />
                  <Label htmlFor="isRequired">Required Document</Label>
                </div>

                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760}
                  onGetUploadParameters={async () => {
                    const response = await fetch('/api/objects/upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    });
                    const data = await response.json();
                    return { method: 'PUT' as const, url: data.uploadURL };
                  }}
                  onComplete={handleDocumentUpload}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>Choose File</span>
                  </div>
                </ObjectUploader>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showOnboardingDialog} onOpenChange={setShowOnboardingDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-start-onboarding">
                <Award className="w-4 h-4 mr-2" />
                Start Onboarding
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start Employee Onboarding</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleStartOnboarding} className="space-y-4">
                <div>
                  <Label htmlFor="employeeId">Employee</Label>
                  <Select value={onboardingEmployeeId} onValueChange={setOnboardingEmployeeId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="templateId">Onboarding Template</Label>
                  <Select value={onboardingTemplateId} onValueChange={setOnboardingTemplateId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Group templates by category */}
                      {onboardingTemplates && onboardingTemplates.length > 0 && (
                        <>
                          {/* Training Templates */}
                          {onboardingTemplates.filter(t => t.category === 'training').length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">Training & Skills</div>
                              {onboardingTemplates
                                .filter(t => t.category === 'training')
                                .map(template => (
                                  <SelectItem key={template.id} value={template.id}>
                                    {template.name} ({template.estimatedDurationDays} days)
                                  </SelectItem>
                                ))}
                            </>
                          )}
                          
                          {/* Document Templates */}
                          {onboardingTemplates.filter(t => t.category === 'documents').length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">HR Documents & Paperwork</div>
                              {onboardingTemplates
                                .filter(t => t.category === 'documents')
                                .map(template => (
                                  <SelectItem key={template.id} value={template.id}>
                                    {template.name} ({template.estimatedDurationDays} days)
                                  </SelectItem>
                                ))}
                            </>
                          )}
                          
                          {/* General Templates */}
                          {onboardingTemplates.filter(t => !t.category || t.category === 'general').length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">General Onboarding</div>
                              {onboardingTemplates
                                .filter(t => !t.category || t.category === 'general')
                                .map(template => (
                                  <SelectItem key={template.id} value={template.id}>
                                    {template.name} ({template.estimatedDurationDays} days)
                                  </SelectItem>
                                ))}
                            </>
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input 
                    type="date" 
                    value={onboardingStartDate}
                    onChange={(e) => setOnboardingStartDate(e.target.value)}
                    required 
                  />
                </div>

                <div>
                  <Label htmlFor="targetDate">Target Completion Date</Label>
                  <Input 
                    type="date" 
                    value={onboardingTargetDate}
                    onChange={(e) => setOnboardingTargetDate(e.target.value)}
                    required 
                  />
                </div>

                <div>
                  <Label htmlFor="mentorId">Assigned Mentor (Optional)</Label>
                  <Select value={onboardingMentorId} onValueChange={setOnboardingMentorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mentor" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full">Start Onboarding Process</Button>
              </form>
            </DialogContent>
          </Dialog>

          <InviteEmployeeDialog 
            trigger={
              <Button variant="outline" data-testid="button-invite-employee">
                <Send className="w-4 h-4 mr-2" />
                Invite Employee
              </Button>
            }
          />
        </div>
      </div>

      {/* Document Assignment Wizard */}
      <DocumentAssignmentWizard 
        isOpen={showAssignmentWizard} 
        onClose={() => setShowAssignmentWizard(false)} 
      />

      {/* Analytics Dashboard */}
      {onboardingAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-active-onboarding">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Active Onboarding</p>
                  <p className="text-2xl font-bold">{onboardingAnalytics.totalActiveOnboarding}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-month">
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Completed This Month</p>
                  <p className="text-2xl font-bold">{onboardingAnalytics.completedThisMonth}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-overdue">
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold">{onboardingAnalytics.overdueOnboarding}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-completion">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Avg Completion</p>
                  <p className="text-2xl font-bold">{onboardingAnalytics.averageCompletionDays} days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Select Employee
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an employee to view documents and onboarding progress" />
              </SelectTrigger>
              <SelectContent>
                {employees?.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} - {emp.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      {selectedEmployee && (
        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="onboarding">Onboarding Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Employee Documents</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={documentFilter} onValueChange={setDocumentFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="uploaded">Uploaded</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredDocuments.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No documents found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedEmployee ? 'This employee has no documents.' : 'Select an employee to view their documents.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{doc.documentName}</h3>
                            <Badge className={getDocumentStatusColor(doc.status)}>
                              {doc.status}
                            </Badge>
                            {doc.isRequired && (
                              <Badge variant="outline">Required</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Type: {doc.documentType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Uploaded: {doc.createdAt ? format(new Date(doc.createdAt), 'MMM d, yyyy') : 'N/A'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Onboarding Progress</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={onboardingFilter} onValueChange={setOnboardingFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredOnboarding.length === 0 ? (
                  <div className="text-center py-8">
                    <Award className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">No onboarding processes found</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This employee has no active onboarding processes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredOnboarding.map((onb) => (
                      <div key={onb.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">Onboarding Process</h3>
                            <Badge className={getOnboardingStatusColor(onb.status)}>
                              {onb.status?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          </div>
                          <span className="text-sm font-medium text-blue-600">
                            {Number(onb.progressPercentage || 0).toFixed(0)}% Complete
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${Number(onb.progressPercentage || 0)}%` }}
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Started:</span>
                            <span className="ml-1">
                              {onb.startDate ? format(new Date(onb.startDate), 'MMM d, yyyy') : 'Not started'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Target:</span>
                            <span className="ml-1">
                              {onb.targetCompletionDate ? format(new Date(onb.targetCompletionDate), 'MMM d, yyyy') : 'Not set'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Steps:</span>
                            <span className="ml-1">{onb.completedSteps}/{onb.totalSteps}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <span className="ml-1 capitalize">{onb.status?.replace('-', ' ')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}