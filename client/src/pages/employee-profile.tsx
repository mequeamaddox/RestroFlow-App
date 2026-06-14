import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Shield, 
  CreditCard,
  Users,
  ChevronLeft,
  FileText,
  Eye,
  EyeOff,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Signature,
  Download,
  Upload
} from "lucide-react";
import { Link } from "wouter";

interface EmployeeDocument {
  id: string;
  status: 'pending' | 'sent' | 'viewed' | 'completed' | 'signed' | 'overdue';
  sentAt?: string;
  viewedAt?: string;
  completedAt?: string;
  signedAt?: string;
  expiresAt?: string;
  notes?: string;
  completedFilePath?: string;
  signaturePath?: string;
  templateName: string;
  templateType: 'federal_w4' | 'state_w4' | 'i9' | 'handbook' | 'policy' | 'contract' | 'other';
  requiresSignature: boolean;
  isRequired: boolean;
  description?: string;
}

interface DocumentTemplate {
  id: string;
  name: string;
  type: 'federal_w4' | 'state_w4' | 'i9' | 'handbook' | 'policy' | 'contract' | 'other';
  description?: string;
  requiresSignature: boolean;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface EmployeeProfile {
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email: string;
    position: { 
      id: string;
      title: string;
      description: string;
    } | string;
    department: { 
      id: string;
      name: string;
      description: string;
    } | string;
    status: string;
    hireDate: string;
    locationId: string;
  };
  documents?: EmployeeDocument[];
  onboardingData?: {
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    dateOfBirth?: string;
    socialSecurityNumber?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    accountType?: string;
    completedAt?: string;
  };
}

export default function EmployeePage() {
  const [, params] = useRoute("/employees/:id");
  const employeeId = params?.id;
  const [showSensitiveData, setShowSensitiveData] = useState(false);
  const [selectedDocumentTemplate, setSelectedDocumentTemplate] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profileData, isLoading, error } = useQuery<EmployeeProfile>({
    queryKey: [`/api/employees/${employeeId}/profile`],
    enabled: !!employeeId,
  });

  // Fetch document templates for assignment
  const { data: documentTemplates } = useQuery<DocumentTemplate[]>({
    queryKey: ['/api/document-templates'],
  });

  // Mutation for assigning documents
  const assignDocumentMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest('POST', `/api/employee-documents/assign`, {
        employeeId,
        templateId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Document Assigned",
        description: "Document has been assigned to the employee successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${employeeId}/profile`] });
      setSelectedDocumentTemplate('');
    },
    onError: () => {
      toast({
        title: "Assignment Failed",
        description: "Failed to assign document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Debug logging
  console.log("Employee ID:", employeeId);
  console.log("Profile Data:", profileData);
  console.log("Error:", error);
  console.log("Query URL:", `/api/employees/${employeeId}/profile`);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">Employee Not Found</h3>
            <p className="text-muted-foreground mb-4">
              We couldn't find the employee profile you're looking for.
            </p>
            <Link href="/employees">
              <Button variant="outline">
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back to Employees
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { employee, onboardingData } = profileData;

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not provided";
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'pending': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'inactive': return 'bg-accent text-foreground';
      default: return 'bg-accent text-foreground';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/employees">
            <Button variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Employees
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">
                {employee.firstName} {employee.lastName}
              </h1>
              <Badge variant="secondary" className="text-xs font-mono">
                {employee.employeeNumber}
              </Badge>
            </div>
            <p className="text-muted-foreground">{employee.position?.title || employee.position} • {employee.department?.name || employee.department}</p>
          </div>
        </div>
        <Badge className={getStatusColor(employee.status)}>
          {employee.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>Basic Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Email:</span>
              <span className="text-sm">{employee.email}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Hire Date:</span>
              <span className="text-sm">{formatDate(employee.hireDate)}</span>
            </div>
            {employee.phone && (
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Phone:</span>
                <span className="text-sm">{employee.phone}</span>
              </div>
            )}
            {employee.dateOfBirth && (
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Date of Birth:</span>
                <span className="text-sm">{formatDate(employee.dateOfBirth)}</span>
              </div>
            )}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Time with Company:</span>
                <span className="text-sm font-medium">
                  {employee.hireDate ? 
                    Math.floor((new Date().getTime() - new Date(employee.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 30)) + ' months' : 
                    'Not available'
                  }
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Employment Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="text-sm text-muted-foreground">Position:</span>
              <p className="text-sm font-medium">{employee.position?.title || employee.position}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Department:</span>
              <p className="text-sm font-medium">{employee.department?.name || employee.department}</p>
            </div>
            {employee.hourlyRate && (
              <div>
                <span className="text-sm text-muted-foreground">Hourly Rate:</span>
                <p className="text-sm font-medium">${parseFloat(employee.hourlyRate).toFixed(2)}/hour</p>
              </div>
            )}
            {employee.salary && (
              <div>
                <span className="text-sm text-muted-foreground">Annual Salary:</span>
                <p className="text-sm font-medium">${parseFloat(employee.salary).toLocaleString()}</p>
              </div>
            )}
            <div>
              <span className="text-sm text-muted-foreground">Pay Frequency:</span>
              <p className="text-sm font-medium capitalize">{employee.payFrequency || 'biweekly'}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Employee ID:</span>
              <p className="text-sm font-mono font-medium">{employee.employeeNumber}</p>
            </div>
          </CardContent>
        </Card>

        {/* Address Information */}
        {onboardingData && (onboardingData.address || onboardingData.city || onboardingData.state) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MapPin className="w-5 h-5" />
                <span>Address</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {onboardingData.address && (
                <p className="text-sm">{onboardingData.address}</p>
              )}
              {(onboardingData.city || onboardingData.state || onboardingData.zipCode) && (
                <p className="text-sm">
                  {[onboardingData.city, onboardingData.state, onboardingData.zipCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Emergency Contact */}
        {onboardingData && (onboardingData.emergencyContactName || onboardingData.emergencyContactPhone) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="w-5 h-5" />
                <span>Emergency Contact</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {onboardingData.emergencyContactName && (
                <div>
                  <span className="text-sm text-muted-foreground">Name:</span>
                  <p className="text-sm font-medium">{onboardingData.emergencyContactName}</p>
                </div>
              )}
              {onboardingData.emergencyContactPhone && (
                <div>
                  <span className="text-sm text-muted-foreground">Phone:</span>
                  <p className="text-sm">{onboardingData.emergencyContactPhone}</p>
                </div>
              )}
              {onboardingData.emergencyContactRelationship && (
                <div>
                  <span className="text-sm text-muted-foreground">Relationship:</span>
                  <p className="text-sm">{onboardingData.emergencyContactRelationship}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Banking Information - Sensitive Data */}
        {onboardingData && (onboardingData.bankName || onboardingData.accountNumber) && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5" />
                  <span>Banking Information</span>
                  <Shield className="w-4 h-4 text-amber-500" />
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSensitiveData(!showSensitiveData)}
                  data-testid="toggle-sensitive-data"
                >
                  {showSensitiveData ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Show Details
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {onboardingData.bankName && (
                  <div>
                    <span className="text-sm text-muted-foreground">Bank Name:</span>
                    <p className="text-sm font-medium">{onboardingData.bankName}</p>
                  </div>
                )}
                {onboardingData.accountType && (
                  <div>
                    <span className="text-sm text-muted-foreground">Account Type:</span>
                    <p className="text-sm">{onboardingData.accountType}</p>
                  </div>
                )}
                {onboardingData.accountNumber && (
                  <div>
                    <span className="text-sm text-muted-foreground">Account Number:</span>
                    <p className="text-sm font-mono">
                      {showSensitiveData ? onboardingData.accountNumber : onboardingData.accountNumber}
                    </p>
                  </div>
                )}
                {onboardingData.routingNumber && (
                  <div>
                    <span className="text-sm text-muted-foreground">Routing Number:</span>
                    <p className="text-sm font-mono">
                      {showSensitiveData ? onboardingData.routingNumber : onboardingData.routingNumber}
                    </p>
                  </div>
                )}
              </div>
              
              {/* SSN if available */}
              {onboardingData.socialSecurityNumber && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <span className="text-sm text-muted-foreground">Social Security Number:</span>
                    <p className="text-sm font-mono">
                      {onboardingData.socialSecurityNumber}
                    </p>
                  </div>
                </>
              )}
              
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 flex items-start space-x-2">
                  <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    This information is encrypted and secure. Access is logged for compliance purposes.
                    Only authorized personnel should view sensitive banking details.
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Onboarding Completion Info */}
        {onboardingData?.completedAt && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Onboarding Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Completed:</span>
                  <span className="text-sm">{formatDate(onboardingData.completedAt)}</span>
                </div>
                <Badge className="bg-green-900/30 text-green-400 border border-green-800">
                  Onboarding Complete
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Work History & Performance */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Work History & Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Employment Timeline</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-900/20 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-green-300">Current Position</p>
                      <p className="text-xs text-green-400">{employee.position?.title || employee.position}</p>
                    </div>
                    <Badge className="bg-green-900/30 text-green-400 border border-green-800">Active</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Started: {formatDate(employee.hireDate)}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Quick Stats</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Days with Company:</span>
                    <span className="text-sm font-medium">
                      {employee.hireDate ? 
                        Math.floor((new Date().getTime() - new Date(employee.hireDate).getTime()) / (1000 * 60 * 60 * 24)) + ' days' : 
                        'N/A'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge className={getStatusColor(employee.status)}>
                      {employee.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Employee Type:</span>
                    <span className="text-sm font-medium">
                      {employee.hourlyRate ? 'Hourly' : employee.salary ? 'Salaried' : 'Not Set'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Notes & Comments</h4>
                <div className="p-3 bg-muted rounded-lg min-h-[100px]">
                  {employee.notes ? (
                    <p className="text-sm text-foreground">{employee.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No notes available</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document Management Section */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="w-5 h-5" />
                  <span>Employee Documents</span>
                </CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Send className="w-4 h-4 mr-2" />
                      Assign Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign Document to {employee.firstName} {employee.lastName}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select value={selectedDocumentTemplate} onValueChange={setSelectedDocumentTemplate}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document to assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {documentTemplates?.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                              {template.isRequired && <span className="text-red-600 ml-2">*</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-end space-x-2">
                        <DialogTrigger asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogTrigger>
                        <Button 
                          onClick={() => selectedDocumentTemplate && assignDocumentMutation.mutate(selectedDocumentTemplate)}
                          disabled={!selectedDocumentTemplate || assignDocumentMutation.isPending}
                        >
                          {assignDocumentMutation.isPending ? 'Assigning...' : 'Assign Document'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {profileData.documents && profileData.documents.length > 0 ? (
                  <>
                    {/* Document Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {profileData.documents.filter(doc => doc.status === 'completed' || doc.status === 'signed').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                          {profileData.documents.filter(doc => doc.status === 'sent' || doc.status === 'viewed').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Pending</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {profileData.documents.filter(doc => doc.status === 'overdue').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Overdue</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {profileData.documents.filter(doc => doc.requiresSignature && doc.status === 'signed').length}
                        </div>
                        <div className="text-xs text-muted-foreground">Signed</div>
                      </div>
                    </div>

                    {/* Document List */}
                    <div className="space-y-3">
                      {profileData.documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {doc.status === 'completed' || doc.status === 'signed' ? (
                                <CheckCircle className="w-6 h-6 text-green-500" />
                              ) : doc.status === 'overdue' ? (
                                <AlertCircle className="w-6 h-6 text-red-500" />
                              ) : (
                                <Clock className="w-6 h-6 text-yellow-500" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium">{doc.templateName}</h4>
                              <p className="text-sm text-muted-foreground">
                                {doc.description || getDocumentTypeDescription(doc.templateType)}
                              </p>
                              <div className="flex items-center space-x-4 mt-1">
                                <Badge variant={getDocumentStatusVariant(doc.status)}>
                                  {getDocumentStatusLabel(doc.status)}
                                </Badge>
                                {doc.requiresSignature && (
                                  <div className="flex items-center text-sm text-muted-foreground">
                                    <Signature className="w-3 h-3 mr-1" />
                                    Signature Required
                                  </div>
                                )}
                                {doc.isRequired && (
                                  <div className="flex items-center text-sm text-red-600">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Required
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {doc.completedFilePath && (
                              <Button size="sm" variant="outline">
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </Button>
                            )}
                            {doc.signaturePath && (
                              <Button size="sm" variant="outline">
                                <Signature className="w-4 h-4 mr-2" />
                                View Signature
                              </Button>
                            )}
                            <div className="text-xs text-muted-foreground text-right">
                              {doc.sentAt && (
                                <div>Sent: {formatDate(doc.sentAt)}</div>
                              )}
                              {doc.completedAt && (
                                <div>Completed: {formatDate(doc.completedAt)}</div>
                              )}
                              {doc.signedAt && (
                                <div>Signed: {formatDate(doc.signedAt)}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No Documents Assigned</h3>
                    <p className="text-muted-foreground mb-4">
                      This employee hasn't been assigned any documents yet. Use the "Assign Document" button to send required paperwork like W-4s, I-9s, or company policies.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  // Helper functions
  function getDocumentTypeDescription(type: string) {
    const descriptions = {
      federal_w4: 'Federal tax withholding form',
      state_w4: 'State tax withholding form', 
      i9: 'Employment eligibility verification',
      handbook: 'Employee handbook and policies',
      policy: 'Company policy document',
      contract: 'Employment contract',
      other: 'Additional documentation'
    };
    return descriptions[type as keyof typeof descriptions] || 'Document';
  }

  function getDocumentStatusLabel(status: string) {
    const labels = {
      pending: 'Not Sent',
      sent: 'Sent',
      viewed: 'Viewed', 
      completed: 'Completed',
      signed: 'Signed',
      overdue: 'Overdue'
    };
    return labels[status as keyof typeof labels] || status;
  }

  function getDocumentStatusVariant(status: string): "default" | "destructive" | "outline" | "secondary" {
    switch (status) {
      case 'completed':
      case 'signed':
        return 'default'; // Green
      case 'overdue':
        return 'destructive'; // Red
      case 'viewed':
      case 'sent':
        return 'secondary'; // Yellow
      default:
        return 'outline'; // Gray
    }
  }
}