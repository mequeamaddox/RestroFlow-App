import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "@/contexts/LocationContext";
import { CalendarIcon, Search, Users, FileText, Clock, CheckCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  department?: { name: string };
  position?: { title: string };
}

interface DocumentTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
}

interface DocumentAssignmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const WIZARD_STEPS = [
  { id: 'employees', title: 'Select Employees', icon: Users },
  { id: 'documents', title: 'Choose Documents', icon: FileText },
  { id: 'schedule', title: 'Set Deadline', icon: Clock },
  { id: 'review', title: 'Review & Assign', icon: CheckCircle },
];

export function DocumentAssignmentWizard({ isOpen, onClose }: DocumentAssignmentWizardProps) {
  const { toast } = useToast();
  const { currentLocation } = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [deadline, setDeadline] = useState<Date>();
  const [notes, setNotes] = useState("");

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    enabled: !!currentLocation,
  });

  // Fetch document templates
  const { data: documentTemplates = [] } = useQuery<DocumentTemplate[]>({
    queryKey: [`/api/document-templates?locationId=${currentLocation?.id}`],
    enabled: !!currentLocation,
  });

  // Fetch departments for filtering
  const { data: departments = [] } = useQuery<Array<{id: string, name: string}>>({
    queryKey: ['/api/hr/departments', currentLocation?.id],
    enabled: !!currentLocation,
  });

  // Filter employees based on search and department
  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = searchTerm === "" || 
      `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = filterDepartment === "all" || filterDepartment === "" || employee.department?.name === filterDepartment;
    
    return matchesSearch && matchesDepartment;
  });

  // Bulk assignment mutation
  const assignDocumentsMutation = useMutation({
    mutationFn: async () => {
      const assignments = [];
      for (const employeeId of selectedEmployees) {
        for (const templateId of selectedDocuments) {
          assignments.push({
            employeeId,
            templateId,
            deadline: deadline?.toISOString(),
            notes,
          });
        }
      }
      
      return Promise.all(
        assignments.map(assignment =>
          apiRequest('POST', '/api/employee-documents/assign', assignment)
        )
      );
    },
    onSuccess: () => {
      toast({
        title: "Documents Assigned Successfully",
        description: `Assigned ${selectedDocuments.length} document(s) to ${selectedEmployees.length} employee(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/employee-documents'] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Assignment Failed",
        description: "Failed to assign documents. Please try again.",
        variant: "destructive",
      });
      console.error('Assignment error:', error);
    },
  });

  const handleClose = () => {
    setCurrentStep(0);
    setSelectedEmployees([]);
    setSelectedDocuments([]);
    setSearchTerm("");
    setFilterDepartment("");
    setDeadline(undefined);
    setNotes("");
    onClose();
  };

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0: // Employees step
        return selectedEmployees.length > 0;
      case 1: // Documents step
        return selectedDocuments.length > 0;
      case 2: // Schedule step
        return true; // Deadline is optional
      case 3: // Review step
        return true;
      default:
        return false;
    }
  };

  const handleEmployeeToggle = (employeeId: string) => {
    setSelectedEmployees(prev =>
      prev.includes(employeeId)
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleDocumentToggle = (documentId: string) => {
    setSelectedDocuments(prev =>
      prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleSelectAllEmployees = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(emp => emp.id));
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Employee Selection
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Select Employees</h3>
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employees..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-employee-search"
                    />
                  </div>
                </div>
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger className="w-48" data-testid="select-department-filter">
                    <SelectValue placeholder="Filter by department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllEmployees}
                  data-testid="button-select-all-employees"
                >
                  {selectedEmployees.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Badge variant="secondary">
                  {selectedEmployees.length} of {filteredEmployees.length} selected
                </Badge>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {filteredEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleEmployeeToggle(employee.id)}
                    data-testid={`employee-item-${employee.id}`}
                  >
                    <Checkbox
                      checked={selectedEmployees.includes(employee.id)}
                      onChange={() => handleEmployeeToggle(employee.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{employee.firstName} {employee.lastName}</p>
                      <p className="text-sm text-muted-foreground">{employee.email}</p>
                      {employee.department && (
                        <p className="text-xs text-muted-foreground">
                          {employee.department.name} {employee.position && `• ${employee.position.title}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 1: // Document Selection
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Choose Documents</h3>
              <div className="mb-4">
                <Badge variant="secondary">
                  {selectedDocuments.length} document(s) selected
                </Badge>
              </div>
              
              <div className="space-y-3">
                {documentTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleDocumentToggle(template.id)}
                    data-testid={`document-item-${template.id}`}
                  >
                    <Checkbox
                      checked={selectedDocuments.includes(template.id)}
                      onChange={() => handleDocumentToggle(template.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                      <Badge variant="outline" className="mt-1">
                        {template.type.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 2: // Schedule & Deadline
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Set Deadline & Notes</h3>
              
              <div className="space-y-4">
                <div>
                  <Label>Deadline (Optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !deadline && "text-muted-foreground"
                        )}
                        data-testid="button-select-deadline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {deadline ? format(deadline, "PPP") : "Select deadline"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={deadline}
                        onSelect={setDeadline}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add any additional instructions or notes for the employees..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    data-testid="textarea-assignment-notes"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 3: // Review & Confirm
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Review Assignment</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">EMPLOYEES ({selectedEmployees.length})</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedEmployees.map(employeeId => {
                      const employee = employees.find(emp => emp.id === employeeId);
                      return employee ? (
                        <Badge key={employeeId} variant="secondary">
                          {employee.firstName} {employee.lastName}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">DOCUMENTS ({selectedDocuments.length})</h4>
                  <div className="mt-2 space-y-2">
                    {selectedDocuments.map(documentId => {
                      const document = documentTemplates.find(doc => doc.id === documentId);
                      return document ? (
                        <div key={documentId} className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{document.name}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                {deadline && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">DEADLINE</h4>
                      <p className="text-sm mt-1">{format(deadline, "PPP")}</p>
                    </div>
                  </>
                )}

                {notes && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">NOTES</h4>
                      <p className="text-sm mt-1">{notes}</p>
                    </div>
                  </>
                )}

                <Separator />

                <div className="bg-muted/50 p-4 rounded-lg">
                  <p className="font-medium text-sm">Total Assignments: {selectedEmployees.length * selectedDocuments.length}</p>
                  <p className="text-sm text-muted-foreground">
                    This will create {selectedEmployees.length * selectedDocuments.length} individual document assignments.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document Assignment Wizard</DialogTitle>
        </DialogHeader>

        {/* Step Progress Indicator */}
        <div className="flex items-center justify-between mb-6">
          {WIZARD_STEPS.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  index === currentStep ? "text-primary font-medium" : 
                  index < currentStep ? "text-green-600" : "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    index === currentStep ? "bg-primary text-primary-foreground" :
                    index < currentStep ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  <StepIcon className="h-4 w-4" />
                </div>
                <span className="hidden sm:inline">{step.title}</span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            data-testid="button-wizard-previous"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} data-testid="button-wizard-cancel">
              Cancel
            </Button>
            
            {currentStep === WIZARD_STEPS.length - 1 ? (
              <Button
                onClick={() => assignDocumentsMutation.mutate()}
                disabled={assignDocumentsMutation.isPending}
                data-testid="button-wizard-assign"
              >
                {assignDocumentsMutation.isPending ? "Assigning..." : "Assign Documents"}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canProceedToNext()}
                data-testid="button-wizard-next"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}