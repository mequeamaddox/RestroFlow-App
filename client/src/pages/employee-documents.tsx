import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { DigitalDocumentForm } from '@/components/employee/DigitalDocumentForm';
import { ObjectUploader } from '@/components/ObjectUploader';
import { 
  FileText, Download, CheckCircle, Clock, AlertTriangle,
  Eye, ArrowLeft, Calendar, User, Target, Award, Star, PenTool, Upload, Plus
} from "lucide-react";
import { format } from "date-fns";

interface EmployeeDocument {
  id: string;
  templateId: string;
  template: {
    name: string;
    type: string;
    description: string;
    requirements?: string;
  };
  status: 'assigned' | 'in_progress' | 'completed' | 'signed' | 'uploaded' | 'approved' | 'rejected';
  deadline?: string;
  notes?: string;
  assignedAt: string;
  completedAt?: string;
  filePath?: string;
  feedback?: string;
}

export default function EmployeeDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDocument, setSelectedDocument] = useState<EmployeeDocument | null>(null);
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [showDigitalForm, setShowDigitalForm] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [selectedDocumentForUpload, setSelectedDocumentForUpload] = useState<EmployeeDocument | null>(null);

  // Fetch employee documents
  const { data: documents = [], isLoading } = useQuery<EmployeeDocument[]>({
    queryKey: [`/api/employees/${user?.id}/documents`],
    enabled: !!user?.id,
  });

  // Digital signature mutation
  const signatureMutation = useMutation({
    mutationFn: async (data: { documentId: string; signatureData: string; signedName: string }) => {
      return await apiRequest('POST', `/api/employee-documents/${data.documentId}/signature`, {
        body: {
          signatureData: data.signatureData,
          signedName: data.signedName,
          employeeId: user?.id,
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Document Signed",
        description: "Your digital signature has been recorded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${user?.id}/documents`] });
      setShowDigitalForm(false);
      setSelectedDocument(null);
    },
    onError: () => {
      toast({
        title: "Signature Failed",
        description: "Failed to record digital signature. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Start document mutation
  const startDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return await apiRequest('PUT', `/api/employee-documents/${documentId}/start`);
    },
    onSuccess: () => {
      toast({
        title: "Document Started",
        description: "Document status updated to in progress.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${user?.id}/documents`] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update document status.",
        variant: "destructive",
      });
    },
  });

  // Manager paper upload mutation
  const managerUploadMutation = useMutation({
    mutationFn: async ({ documentId, filePath, fileSize, mimeType }: { 
      documentId: string; 
      filePath: string; 
      fileSize: number; 
      mimeType: string; 
    }) => {
      return await apiRequest('PUT', `/api/employee-documents/${documentId}/manager-upload`, {
        filePath,
        fileSize,
        mimeType,
      });
    },
    onSuccess: () => {
      toast({
        title: "Paper Copy Uploaded",
        description: "Paper document has been uploaded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${user?.id}/documents`] });
      setSelectedDocumentForUpload(null);
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Failed to upload paper copy. Please try again.",
        variant: "destructive",
      });
    },
  });


  const handleManagerUpload = async (result: any) => {
    const uploadedFile = result.successful[0];
    if (uploadedFile && selectedDocumentForUpload) {
      managerUploadMutation.mutate({
        documentId: selectedDocumentForUpload.id,
        filePath: uploadedFile.uploadURL,
        fileSize: uploadedFile.size || 0,
        mimeType: uploadedFile.type || 'application/octet-stream',
      });
    }
  };

  // Check if user is manager/owner for upload capabilities
  const isManager = user?.role === 'owner' || user?.role === 'platform_admin' || user?.role === 'manager' || user?.role === 'gm' || user?.role === 'foh_manager' || user?.role === 'boh_manager';

  const PENDING_STATUSES = ['sent', 'viewed', 'assigned', 'in_progress'];
  const DONE_STATUSES = ['completed', 'signed', 'uploaded', 'approved'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'uploaded': return 'bg-cyan-900/30 text-cyan-400 border border-cyan-800';
      case 'signed': return 'bg-purple-900/30 text-purple-400 border border-purple-800';
      case 'completed': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'viewed': case 'in_progress': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'sent': case 'assigned': return 'bg-accent text-foreground border-border';
      case 'declined': case 'rejected': return 'bg-red-900/30 text-red-400 border border-red-800';
      default: return 'bg-accent text-foreground border-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'uploaded': return <Upload className="h-4 w-4 text-cyan-600" />;
      case 'signed': return <PenTool className="h-4 w-4 text-purple-600" />;
      case 'completed': return <Clock className="h-4 w-4 text-blue-600" />;
      case 'viewed': case 'in_progress': return <Target className="h-4 w-4 text-yellow-600" />;
      case 'sent': case 'assigned': return <FileText className="h-4 w-4 text-muted-foreground" />;
      case 'declined': case 'rejected': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const filteredDocuments = documents.filter(doc => {
    if (filter === 'all') return true;
    if (filter === 'pending') return PENDING_STATUSES.includes(doc.status);
    if (filter === 'overdue') {
      return doc.deadline && new Date(doc.deadline) < new Date() && !DONE_STATUSES.includes(doc.status);
    }
    return doc.status === filter;
  });

  const stats = {
    total: documents.length,
    pending: documents.filter(doc => PENDING_STATUSES.includes(doc.status)).length,
    completed: documents.filter(doc => DONE_STATUSES.includes(doc.status)).length,
    overdue: documents.filter(doc =>
      doc.deadline && new Date(doc.deadline) < new Date() && !DONE_STATUSES.includes(doc.status)
    ).length,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

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
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="page-title">My Documents</h1>
        <p className="text-muted-foreground">View and complete your assigned documents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-900/30 to-blue-900/10 border-blue-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Documents</p>
                <p className="text-2xl font-bold text-blue-400">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-900/30 to-orange-900/10 border-orange-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-orange-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-orange-400">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/30 to-green-900/10 border-green-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-900/30 to-red-900/10 border-red-800/50">
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-400">{stats.overdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-600" />
              Completion Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-2xl font-bold text-green-600">{completionRate}%</span>
              </div>
              <Progress value={completionRate} className="h-3" />
              <p className="text-sm text-muted-foreground">
                {stats.completed} of {stats.total} documents completed
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manager Upload Section */}
      {isManager && (
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardHeader>
            <CardTitle className="flex items-center text-emerald-800">
              <Upload className="h-5 w-5 mr-2" />
              Manager Functions - Upload Paper Copies
            </CardTitle>
            <p className="text-emerald-600 text-sm">
              Upload paper copies of documents for employees who completed forms before digital transition
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {documents.filter(doc => ['completed', 'signed'].includes(doc.status)).length > 0 ? (
                <>
                  <select
                    className="px-3 py-2 border rounded-md bg-card text-sm"
                    value={selectedDocumentForUpload?.id || ''}
                    onChange={(e) => {
                      const doc = documents.find(d => d.id === e.target.value);
                      setSelectedDocumentForUpload(doc || null);
                    }}
                  >
                    <option value="">Select document to attach paper copy...</option>
                    {documents
                      .filter(doc => ['completed', 'signed'].includes(doc.status))
                      .map(doc => (
                        <option key={doc.id} value={doc.id}>
                          {doc.template.name} - {doc.template.type}
                        </option>
                      ))
                    }
                  </select>
                  
                  {selectedDocumentForUpload && (
                    <ObjectUploader
                      maxNumberOfFiles={1}
                      maxFileSize={10485760}
                      onGetUploadParameters={async () => {
                        const response = await apiRequest('POST', '/api/objects/upload');
                        const data = await response.json();
                        return {
                          method: 'PUT' as const,
                          url: data.uploadURL,
                        };
                      }}
                      onComplete={handleManagerUpload}
                      buttonClassName="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Paper Copy
                    </ObjectUploader>
                  )}
                </>
              ) : (
                <p className="text-emerald-600 text-sm italic">
                  No completed documents available for paper upload
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter} className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({stats.pending})
            {stats.pending > 0 && <Star className="h-3 w-3 ml-1 text-yellow-500" />}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          {stats.overdue > 0 && (
            <TabsTrigger value="overdue" className="text-red-600">
              Overdue ({stats.overdue})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={filter} className="space-y-4">
          <Card>
            <CardContent className="p-6">
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No documents found</h3>
                  <p className="text-muted-foreground">
                    {filter === 'all' ? 'No documents have been assigned to you yet.' : 
                     filter === 'overdue' ? 'No overdue documents.' :
                     `No ${filter} documents.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDocuments.map((doc) => {
                    const isOverdue = doc.deadline && new Date(doc.deadline) < new Date() && !DONE_STATUSES.includes(doc.status);
                    
                    return (
                      <div key={doc.id} className={`border rounded-lg p-6 hover:shadow-md transition-shadow ${isOverdue ? 'border-red-800/50 bg-red-900/20' : ''}`}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {getStatusIcon(doc.status)}
                              <h3 className="text-lg font-semibold">{doc.template?.name || 'Document'}</h3>
                              <Badge className={getStatusColor(doc.status)}>
                                {doc.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                              {isOverdue && (
                                <Badge variant="destructive">OVERDUE</Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground mb-2">{doc.template?.description || 'No description available'}</p>
                            
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>Assigned: {doc.assignedAt ? format(new Date(doc.assignedAt), 'MMM d, yyyy') : 'Unknown'}</span>
                              </div>
                              {doc.deadline && (
                                <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                                  <Clock className="h-4 w-4" />
                                  <span>Due: {doc.deadline ? format(new Date(doc.deadline), 'MMM d, yyyy') : 'No deadline'}</span>
                                </div>
                              )}
                              {doc.completedAt && (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="h-4 w-4" />
                                  <span>Completed: {doc.completedAt ? format(new Date(doc.completedAt), 'MMM d, yyyy') : 'Not completed'}</span>
                                </div>
                              )}
                            </div>

                            {doc.notes && (
                              <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded">
                                <p className="text-sm text-blue-300">
                                  <strong>Instructions:</strong> {doc.notes}
                                </p>
                              </div>
                            )}

                            {doc.feedback && (
                              <div className={`mt-3 p-3 border rounded ${
                                doc.status === 'rejected' ? 'bg-red-900/30 border-red-700/50' : 'bg-green-900/30 border-green-700/50'
                              }`}>
                                <p className={`text-sm ${
                                  doc.status === 'rejected' ? 'text-red-400' : 'text-green-400'
                                }`}>
                                  <strong>Feedback:</strong> {doc.feedback}
                                </p>
                              </div>
                            )}

                            {doc.template?.requirements && (
                              <div className="mt-3 p-3 bg-muted border border-border rounded">
                                <p className="text-sm text-foreground">
                                  <strong>Requirements:</strong> {doc.template.requirements}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2 ml-4">
                            {['sent', 'assigned'].includes(doc.status) && (
                              <Button
                                onClick={() => {
                                  setSelectedDocument(doc);
                                  setShowDigitalForm(true);
                                  startDocumentMutation.mutate(doc.id);
                                }}
                                disabled={startDocumentMutation.isPending}
                                data-testid={`button-start-${doc.id}`}
                              >
                                Start Document
                              </Button>
                            )}

                            {['viewed', 'in_progress'].includes(doc.status) && (
                              <Button
                                onClick={() => {
                                  setSelectedDocument(doc);
                                  setShowDigitalForm(true);
                                }}
                                data-testid={`button-continue-${doc.id}`}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                Continue Form
                              </Button>
                            )}

                            {DONE_STATUSES.includes(doc.status) && doc.filePath && (
                              <Button
                                variant="outline"
                                onClick={() => window.open(doc.filePath, '_blank')}
                                data-testid={`button-download-${doc.id}`}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              onClick={() => setSelectedDocument(doc)}
                              data-testid={`button-view-${doc.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Digital Signature Dialog */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Digital Signature Required</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-900/30 border border-blue-700/50 rounded">
                <p className="font-medium text-blue-300">{selectedDocument.template?.name || 'Document'}</p>
                <p className="text-sm text-blue-400">Complete your digital signature to finalize this document.</p>
              </div>
              
              <div className="border-2 border-dashed border-border rounded-lg p-4">
                <div className="text-center space-y-2">
                  <FileText className="h-8 w-8 text-gray-400 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Click below to add your digital signature
                  </p>
                  <Button 
                    onClick={() => {
                      setShowSignatureDialog(false);
                      setShowDigitalForm(true);
                    }}
                    className="w-full"
                  >
                    Sign Document
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Digital Document Form Dialog */}
      <Dialog open={showDigitalForm} onOpenChange={() => {
        setShowDigitalForm(false);
        setSelectedDocument(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Digital Form Completion
            </DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <DigitalDocumentForm
              assignmentId={selectedDocument.id}
              templateId={selectedDocument.templateId}
              templateName={selectedDocument.template?.name || 'Document'}
              userId={user?.id || ''}
              onComplete={() => {
                setShowDigitalForm(false);
                setSelectedDocument(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Document Details Dialog */}
      <Dialog open={!!selectedDocument && !showDigitalForm} onOpenChange={() => setSelectedDocument(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDocument && getStatusIcon(selectedDocument.status)}
              {selectedDocument?.template?.name || 'Document'}
            </DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={getStatusColor(selectedDocument.status)}>
                  {selectedDocument.status.replace('_', ' ').toUpperCase()}
                </Badge>
                {selectedDocument.deadline && new Date(selectedDocument.deadline) < new Date() && 
                 !['completed', 'approved'].includes(selectedDocument.status) && (
                  <Badge variant="destructive">OVERDUE</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Document Type</p>
                  <p className="capitalize">{selectedDocument.template?.type?.replace('_', ' ') || 'Unknown'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Assigned Date</p>
                  <p>{selectedDocument.assignedAt ? format(new Date(selectedDocument.assignedAt), 'MMM d, yyyy h:mm a') : 'Unknown'}</p>
                </div>
                {selectedDocument.deadline && (
                  <div>
                    <p className="font-medium text-muted-foreground">Deadline</p>
                    <p className={new Date(selectedDocument.deadline) < new Date() && !['completed', 'approved'].includes(selectedDocument.status) ? 'text-red-600 font-medium' : ''}>
                      {selectedDocument.deadline ? format(new Date(selectedDocument.deadline), 'MMM d, yyyy h:mm a') : 'No deadline'}
                    </p>
                  </div>
                )}
                {selectedDocument.completedAt && (
                  <div>
                    <p className="font-medium text-muted-foreground">Completed Date</p>
                    <p className="text-green-600">{format(new Date(selectedDocument.completedAt), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="font-medium text-muted-foreground mb-2">Description</p>
                <p className="text-foreground">{selectedDocument.template?.description || 'No description available'}</p>
              </div>

              {selectedDocument.template?.requirements && (
                <div>
                  <p className="font-medium text-muted-foreground mb-2">Requirements</p>
                  <p className="text-foreground">{selectedDocument.template.requirements}</p>
                </div>
              )}

              {selectedDocument.notes && (
                <div>
                  <p className="font-medium text-muted-foreground mb-2">Instructions</p>
                  <div className="p-3 bg-blue-900/30 border border-blue-700/50 rounded">
                    <p className="text-blue-300">{selectedDocument.notes}</p>
                  </div>
                </div>
              )}

              {selectedDocument.feedback && (
                <div>
                  <p className="font-medium text-muted-foreground mb-2">Feedback</p>
                  <div className={`p-3 border rounded ${
                    selectedDocument.status === 'rejected' ? 'bg-red-900/30 border-red-700/50' : 'bg-green-900/30 border-green-700/50'
                  }`}>
                    <p className={selectedDocument.status === 'rejected' ? 'text-red-400' : 'text-green-400'}>
                      {selectedDocument.feedback}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedDocument(null)}>
                  Close
                </Button>
                
                {selectedDocument.status === 'assigned' && (
                  <Button
                    onClick={() => {
                      startDocumentMutation.mutate(selectedDocument.id);
                      setSelectedDocument(null);
                    }}
                    disabled={startDocumentMutation.isPending}
                  >
                    Start Document
                  </Button>
                )}
                
                {selectedDocument.status === 'in_progress' && (
                  <Button
                    onClick={() => {
                      setShowDigitalForm(true);
                    }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Complete Form
                  </Button>
                )}

                {['completed', 'signed', 'uploaded', 'approved'].includes(selectedDocument.status) && selectedDocument.filePath && (
                  <Button
                    variant="outline"
                    onClick={() => window.open(selectedDocument.filePath, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {selectedDocument.status === 'uploaded' ? 'View Paper Copy' : 'Download'}
                  </Button>
                )}
                
                {selectedDocument.status === 'uploaded' && isManager && (
                  <div className="text-xs text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md">
                    📄 Paper copy uploaded by manager
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}