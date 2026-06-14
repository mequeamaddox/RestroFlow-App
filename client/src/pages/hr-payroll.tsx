import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from '@/contexts/LocationContext';
import { Calendar, Plus, DollarSign, Users, Clock, Calculator, Eye, CheckCircle, AlertCircle, FileText, Printer, Trash2 } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { ActualPaycheck } from '@/components/payroll/actual-paycheck';

interface PayrollPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  payDate: string;
  status: 'draft' | 'calculated' | 'approved' | 'paid';
  totalGrossPay: string;
  totalNetPay: string;
  totalDeductions: string;
  frequency: string;
  locationId: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

interface Paystub {
  id: string;
  payPeriodId: string;
  employeeId: string;
  regularHours: string;
  overtimeHours: string;
  regularRate: string;
  overtimeRate: string;
  regularPay: string;
  overtimePay: string;
  grossPay: string;
  federalTax: string;
  stateTax: string;
  socialSecurity: string;
  medicare: string;
  totalDeductions: string;
  netPay: string;
  checkNumber: string;
  payDate: string;
  status: 'draft' | 'calculated' | 'paid';
  bonuses?: string;
  tips?: string;
  notes?: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    phone: string;
  };
}

type WorkflowStep = 'setup' | 'calculate' | 'review' | 'approve';

export default function HRPayroll() {
  // Patriot Software 3-Step Workflow State
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('setup');
  const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);
  const [selectedPaystub, setSelectedPaystub] = useState<Paystub | null>(null);
  
  // Dialog States
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPaystubDialog, setShowPaystubDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showManualPayrollDialog, setShowManualPayrollDialog] = useState(false);
  const [showAddHoursDialog, setShowAddHoursDialog] = useState(false);
  const [editingPaystub, setEditingPaystub] = useState<Paystub | null>(null);
  
  // Form State
  const [newPeriodForm, setNewPeriodForm] = useState({
    startDate: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    endDate: format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    payDate: format(addDays(endOfWeek(new Date(), { weekStartsOn: 1 }), 3), 'yyyy-MM-dd'),
    frequency: 'weekly'
  });
  
  const [manualPayrollForm, setManualPayrollForm] = useState({
    employeeId: '',
    regularHours: '',
    overtimeHours: '',
    regularRate: '',
    bonuses: '',
    tips: '',
    customDeductions: '',
    notes: ''
  });

  // Bulk Payroll Real-time Calculation State
  const [bulkPayrollInputs, setBulkPayrollInputs] = useState<Record<string, {
    hours: string;
    tips: string;
    bonus: string;
    overtime: string;
    deduction: string;
    notes: string;
  }>>({});

  // Hour Adjustments (for adding time entries during review)
  const [hourAdjustments, setHourAdjustments] = useState<Record<string, { hours: string; date: string }>>({});
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentLocation } = useLocation();

  // Helper function to calculate gross pay for real-time display
  const calculateEmployeeGrossPay = (employee: any, inputs: any) => {
    const hours = parseFloat(inputs.hours || '0');
    const tips = parseFloat(inputs.tips || '0');
    const bonus = parseFloat(inputs.bonus || '0');
    const overtime = parseFloat(inputs.overtime || '0');
    const deduction = parseFloat(inputs.deduction || '0');
    const hourlyRate = parseFloat(employee.hourlyRate || '0');

    const regularPay = hours * hourlyRate;
    const overtimePay = overtime * hourlyRate * 1.5; // 1.5x for overtime
    const grossPay = regularPay + overtimePay + tips + bonus - deduction;

    return Math.max(0, grossPay);
  };

  // Handler for bulk payroll input changes
  const handleBulkInputChange = (employeeId: string, field: string, value: string) => {
    setBulkPayrollInputs(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: value
      }
    }));
  };

  // Fetch payroll periods
  const { data: periods = [], isLoading: periodsLoading } = useQuery<PayrollPeriod[]>({
    queryKey: ['/api/payroll-periods', currentLocation?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/payroll-periods?locationId=${currentLocation?.id}`);
      return response.json();
    },
    enabled: !!currentLocation,
  });

  // Fetch paystubs for selected period
  const { data: paystubs = [], isLoading: paystubsLoading } = useQuery<Paystub[]>({
    queryKey: ['/api/payroll-periods', selectedPeriod?.id, 'paychecks'],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const response = await apiRequest('GET', `/api/payroll-periods/${selectedPeriod.id}/paychecks`);
      return response.json();
    },
    enabled: !!selectedPeriod?.id,
  });

  // Fetch employees for manual entry
  const { data: employees = [] } = useQuery({
    queryKey: ['/api/hr/employees', currentLocation?.id],
    queryFn: async () => {
      if (!currentLocation?.id) return [];
      const response = await apiRequest('GET', `/api/hr/employees?locationId=${currentLocation.id}`);
      return response.json();
    },
    enabled: !!currentLocation?.id,
  });

  // Fetch calculated hours for the selected period to show existing hours
  const { data: calculatedHours = [] } = useQuery({
    queryKey: ['/api/payroll-periods', selectedPeriod?.id, 'calculated-hours'],
    queryFn: async () => {
      if (!selectedPeriod?.id) return [];
      const response = await apiRequest('GET', `/api/payroll-periods/${selectedPeriod.id}/calculated-hours`);
      return response.json();
    },
    enabled: !!selectedPeriod?.id,
  });

  // Get paycheck settings
  const { data: settings } = useQuery({
    queryKey: ['/api/payroll/paycheck-settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payroll/paycheck-settings');
      return response.json();
    },
  });

  // Create payroll period
  const createPeriodMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/payroll-periods', { body: data });
      return response.json();
    },
    onSuccess: (newPeriod) => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods'] });
      setSelectedPeriod(newPeriod);
      setCurrentStep('calculate');
      setShowCreateDialog(false);
      toast({ 
        title: "Pay Period Created", 
        description: `${newPeriod.name} created successfully. Ready for payroll calculation.` 
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to create pay period", 
        variant: "destructive" 
      });
    },
  });

  // Calculate payroll (Patriot Software Step 2)
  const calculatePayrollMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const response = await apiRequest('POST', `/api/hr/payroll/pay-periods/${periodId}/calculate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods', selectedPeriod?.id, 'paychecks'] });
      setCurrentStep('review');
      toast({ 
        title: "Payroll Calculated", 
        description: "All employee paychecks calculated and saved successfully." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Calculation Failed", 
        description: error.message || "Failed to calculate payroll", 
        variant: "destructive" 
      });
    },
  });

  // Approve payroll (Patriot Software Step 3)
  const approvePayrollMutation = useMutation({
    mutationFn: async ({ periodId, notes }: { periodId: string; notes?: string }) => {
      const response = await apiRequest('POST', `/api/hr/payroll/pay-periods/${periodId}/approve`, { 
        body: { notes } 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods'] });
      
      toast({ 
        title: "Payroll Approved", 
        description: "Payroll has been approved successfully. PDFs are ready to download." 
      });
      
      setCurrentStep('setup');
      setSelectedPeriod(null);
      setShowApprovalDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Approval Failed", 
        description: error.message || "Failed to approve payroll", 
        variant: "destructive" 
      });
    },
  });

  // Download all PDFs for approved payroll
  const handleDownloadAllPDFs = async () => {
    if (!selectedPeriod) return;
    
    try {
      const response = await apiRequest('POST', `/api/hr/payroll/pay-periods/${selectedPeriod.id}/generate-pdfs`);
      const data = await response.json();
      
      if (data.pdfs && data.pdfs.length > 0) {
        console.log(`📥 Downloading ${data.pdfs.length} paycheck PDFs...`);
        
        data.pdfs.forEach((pdf: any) => {
          const blob = new Blob(
            [Uint8Array.from(atob(pdf.pdfBase64), c => c.charCodeAt(0))],
            { type: 'application/pdf' }
          );
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `paycheck-${pdf.employeeName.replace(/\s+/g, '-')}-${pdf.checkNumber}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        });
        
        toast({ 
          title: "PDFs Downloaded", 
          description: `Successfully downloaded ${data.pdfs.length} paycheck PDFs.` 
        });
      }
    } catch (error: any) {
      toast({ 
        title: "Download Failed", 
        description: error.message || "Failed to download PDFs", 
        variant: "destructive" 
      });
    }
  };

  // Manual payroll entry
  const createManualPayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/payroll-periods/${selectedPeriod?.id}/manual-paycheck`, { 
        body: data 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods', selectedPeriod?.id, 'paychecks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods'] });
      setShowManualPayrollDialog(false);
      resetManualForm();
      toast({ 
        title: "Manual Paycheck Created", 
        description: "Manual paycheck entry has been saved successfully." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to Create", 
        description: error.message || "Failed to create manual paycheck", 
        variant: "destructive" 
      });
    },
  });

  // Update existing paycheck
  const updatePaycheckMutation = useMutation({
    mutationFn: async ({ paycheckId, data }: { paycheckId: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/paychecks/${paycheckId}`, { 
        body: data 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods', selectedPeriod?.id, 'paychecks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods'] });
      setEditingPaystub(null);
      toast({ 
        title: "Paycheck Updated", 
        description: "Paycheck has been updated successfully." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Update Failed", 
        description: error.message || "Failed to update paycheck", 
        variant: "destructive" 
      });
    },
  });

  // Add manual time entries (for hour adjustments)
  const addTimeEntryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/hr/time-entries/manual', { 
        body: data 
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Time Entry Added", 
        description: "Manual time entry has been recorded. Recalculate payroll to apply changes." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to Add Entry", 
        description: error.message || "Failed to add time entry", 
        variant: "destructive" 
      });
    },
  });

  // Delete payroll period
  const deletePeriodMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const response = await apiRequest('DELETE', `/api/payroll-periods/${periodId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payroll-periods'] });
      if (selectedPeriod) {
        setSelectedPeriod(null);
        setCurrentStep('setup');
      }
      toast({ 
        title: "Period Deleted", 
        description: "Payroll period deleted successfully." 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Delete Failed", 
        description: error.message || "Failed to delete payroll period", 
        variant: "destructive" 
      });
    },
  });

  const handleCreatePeriod = () => {
    createPeriodMutation.mutate({
      ...newPeriodForm,
      locationId: currentLocation?.id
    });
  };

  const resetManualForm = () => {
    setManualPayrollForm({
      employeeId: '',
      regularHours: '',
      overtimeHours: '',
      regularRate: '',
      bonuses: '',
      tips: '',
      customDeductions: '',
      notes: ''
    });
  };

  const handleCreateManualPayroll = () => {
    createManualPayrollMutation.mutate(manualPayrollForm);
  };

  const handleBulkManualPayroll = async () => {
    const promises: Promise<any>[] = [];
    let addedCount = 0;

    for (const employee of employees.filter((emp: any) => emp.status === 'active')) {
      const inputs = bulkPayrollInputs[employee.id] || {};
      
      // Create time entries for hours
      if (inputs.hours && parseFloat(inputs.hours) > 0) {
        const hours = parseFloat(inputs.hours);
        const clockInTime = new Date(selectedPeriod!.startDate);
        const clockOutTime = new Date(clockInTime.getTime() + hours * 60 * 60 * 1000);

        const promise = addTimeEntryMutation.mutateAsync({
          employeeId: employee.id,
          clockInTime: clockInTime.toISOString(),
          clockOutTime: clockOutTime.toISOString(),
          notes: `Payroll hours for ${selectedPeriod!.name}`,
          locationId: currentLocation?.id
        });
        promises.push(promise);
        addedCount++;
      }
    }

    try {
      await Promise.all(promises);
      setShowManualPayrollDialog(false);
      setBulkPayrollInputs({});
      toast({
        title: "Hours Entered Successfully",
        description: `Added ${addedCount} time entries. Click "Calculate Payroll" to process paychecks.`
      });
    } catch (error) {
      // Individual errors already handled by mutation
      toast({
        title: "Some Entries Failed",
        description: "Check the errors and try again.",
        variant: "destructive"
      });
    }
  };

  // Handle bulk time entry additions
  const handleAddHours = async () => {
    let addedCount = 0;
    const promises: Promise<any>[] = [];

    for (const employeeId in hourAdjustments) {
      const adjustment = hourAdjustments[employeeId];
      if (adjustment.hours && parseFloat(adjustment.hours) > 0) {
        const hours = parseFloat(adjustment.hours);
        const clockInTime = new Date(adjustment.date || selectedPeriod!.startDate);
        const clockOutTime = new Date(clockInTime.getTime() + hours * 60 * 60 * 1000);

        const promise = addTimeEntryMutation.mutateAsync({
          employeeId,
          clockInTime: clockInTime.toISOString(),
          clockOutTime: clockOutTime.toISOString(),
          notes: 'Manual adjustment for payroll',
          locationId: currentLocation?.id
        });
        promises.push(promise);
        addedCount++;
      }
    }

    try {
      await Promise.all(promises);
      setShowAddHoursDialog(false);
      setHourAdjustments({});
      toast({
        title: "Hours Added Successfully",
        description: `Added ${addedCount} time entries. Click "Calculate Payroll" to update paychecks.`
      });
    } catch (error) {
      // Individual errors already handled by mutation
    }
  };

  const handleEditPaystub = (paystub: Paystub) => {
    setEditingPaystub(paystub);
    setManualPayrollForm({
      employeeId: paystub.employeeId,
      regularHours: paystub.regularHours,
      overtimeHours: paystub.overtimeHours,
      regularRate: paystub.regularRate,
      bonuses: paystub.bonuses || '0',
      tips: paystub.tips || '0',
      customDeductions: '0',
      notes: paystub.notes || ''
    });
  };

  const handleSelectPeriod = (period: PayrollPeriod) => {
    setSelectedPeriod(period);
    if (period.status === 'draft') {
      setCurrentStep('calculate');
    } else if (period.status === 'calculated') {
      setCurrentStep('review');
    } else {
      setCurrentStep('approve');
    }
  };

  const getStepStatus = (step: WorkflowStep) => {
    const stepOrder: WorkflowStep[] = ['setup', 'calculate', 'review', 'approve'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  // Calculate totals for display
  const periodTotals = paystubs.reduce((totals, paystub) => ({
    grossPay: totals.grossPay + parseFloat(paystub.grossPay || '0'),
    deductions: totals.deductions + parseFloat(paystub.totalDeductions || '0'),
    netPay: totals.netPay + parseFloat(paystub.netPay || '0')
  }), { grossPay: 0, deductions: 0, netPay: 0 });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Payroll Management</h1>
          <p className="text-muted-foreground">Professional payroll processing like Patriot Software</p>
        </div>
        {currentStep === 'setup' && (
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2" size="lg">
            <Plus className="w-4 h-4" />
            New Pay Period
          </Button>
        )}
      </div>

      {/* Patriot Software 3-Step Progress */}
      {selectedPeriod && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Payroll Processing: {selectedPeriod.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-6">
              {(['setup', 'calculate', 'review', 'approve'] as WorkflowStep[]).map((step, index) => {
                const status = getStepStatus(step);
                const stepLabels = {
                  setup: 'Setup Period',
                  calculate: 'Calculate Payroll',
                  review: 'Review & Verify',
                  approve: 'Approve & Finalize'
                };
                
                return (
                  <div key={step} className="flex items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                      status === 'current' ? 'bg-blue-500 border-blue-500 text-white' :
                      'bg-accent border-border text-muted-foreground'
                    }`}>
                      {status === 'completed' ? <CheckCircle className="w-5 h-5" /> : index + 1}
                    </div>
                    <div className="ml-3 min-w-0">
                      <p className={`text-sm font-medium ${
                        status === 'current' ? 'text-blue-600' : 
                        status === 'completed' ? 'text-green-600' : 'text-muted-foreground'
                      }`}>
                        {stepLabels[step]}
                      </p>
                    </div>
                    {index < 3 && (
                      <div className={`flex-1 h-0.5 mx-4 ${
                        status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step Actions */}
            <div className="flex gap-4">
              {currentStep === 'calculate' && (
                <>
                  <Button 
                    onClick={() => calculatePayrollMutation.mutate(selectedPeriod.id)}
                    disabled={calculatePayrollMutation.isPending}
                    size="lg"
                    className="gap-2"
                  >
                    <Calculator className="w-4 h-4" />
                    {calculatePayrollMutation.isPending ? 'Calculating...' : 'Calculate Payroll'}
                  </Button>
                  <Button 
                    onClick={() => setShowManualPayrollDialog(true)}
                    variant="outline"
                    size="lg"
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Enter Hours for All Employees
                  </Button>
                </>
              )}
              
              {currentStep === 'review' && paystubs.length > 0 && (
                <div className="flex gap-4 items-start">
                  <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-300">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">Payroll Calculated</span>
                    </div>
                    <p className="text-sm text-green-400 mt-1">
                      {paystubs.length} paychecks • ${periodTotals.netPay.toFixed(2)} total net pay
                    </p>
                  </div>
                  <Button 
                    onClick={() => setShowAddHoursDialog(true)}
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    data-testid="button-add-hours"
                  >
                    <Clock className="w-4 h-4" />
                    Add/Edit Hours
                  </Button>
                  <Button 
                    onClick={() => calculatePayrollMutation.mutate(selectedPeriod.id)}
                    disabled={calculatePayrollMutation.isPending}
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    data-testid="button-recalculate"
                  >
                    <Calculator className="w-4 h-4" />
                    {calculatePayrollMutation.isPending ? 'Recalculating...' : 'Recalculate'}
                  </Button>
                  <Button 
                    onClick={() => setShowApprovalDialog(true)}
                    size="lg"
                    className="gap-2"
                    data-testid="button-approve"
                  >
                    <FileText className="w-4 h-4" />
                    Approve Payroll
                  </Button>
                </div>
              )}

              {selectedPeriod?.status === 'approved' && (
                <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-blue-300">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-semibold">Payroll Approved</span>
                      </div>
                      <p className="text-sm text-blue-400 mt-1">
                        {paystubs.length} paychecks ready • ${periodTotals.netPay.toFixed(2)} total net pay
                      </p>
                    </div>
                    <Button 
                      onClick={handleDownloadAllPDFs}
                      size="lg"
                      className="gap-2"
                      data-testid="button-download-pdfs"
                    >
                      <Printer className="w-4 h-4" />
                      Download All PDFs
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={currentStep === 'setup' ? 'periods' : 'current'} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="periods" onClick={() => { setCurrentStep('setup'); setSelectedPeriod(null); }}>
            Pay Periods
          </TabsTrigger>
          <TabsTrigger value="current" disabled={!selectedPeriod}>
            Current Payroll
          </TabsTrigger>
        </TabsList>

        {/* Pay Periods List */}
        <TabsContent value="periods">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Payroll Periods
              </CardTitle>
              <CardDescription>Select or create a pay period to begin payroll processing</CardDescription>
            </CardHeader>
            <CardContent>
              {periodsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading pay periods...</div>
              ) : periods.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pay periods found. Create your first pay period to get started.
                </div>
              ) : (
                <div className="space-y-3">
                  {periods.map((period) => (
                    <div
                      key={period.id}
                      className="p-4 border rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => handleSelectPeriod(period)}
                        >
                          <h3 className="font-medium">{period.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            Pay Date: {format(new Date(period.payDate), 'MMM d, yyyy')} • {period.frequency}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={
                            period.status === 'approved' ? 'default' : 
                            period.status === 'calculated' ? 'secondary' : 'outline'
                          }>
                            {period.status}
                          </Badge>
                          {period.status !== 'draft' && (
                            <div className="text-right text-sm">
                              <div className="font-medium">${parseFloat(period.totalNetPay || '0').toFixed(2)} Net</div>
                              <div className="text-muted-foreground">${parseFloat(period.totalGrossPay || '0').toFixed(2)} Gross</div>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete ${period.name}? This action cannot be undone.`)) {
                                deletePeriodMutation.mutate(period.id);
                              }
                            }}
                            disabled={deletePeriodMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            data-testid={`button-delete-period-${period.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Current Payroll Processing */}
        <TabsContent value="current">
          {selectedPeriod && (
            <div className="space-y-6">
              {/* Payroll Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Employee Payroll Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        ${periodTotals.grossPay.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">Gross Pay</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        ${periodTotals.deductions.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">Employee Deductions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        ${periodTotals.netPay.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">Net Pay</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Employer Tax Summary Card */}
              <Card className="border-red-800/50 bg-red-900/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-300">
                    <Calculator className="w-5 h-5" />
                    Your Employer Tax Costs
                  </CardTitle>
                  <CardDescription>
                    Additional taxes you pay on top of wages (not deducted from employee pay)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-400">
                        ${(periodTotals.grossPay * 0.062).toFixed(2)}
                      </div>
                      <div className="text-xs text-red-400/70">Social Security Match<br/>(6.2%)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-400">
                        ${(periodTotals.grossPay * 0.0145).toFixed(2)}
                      </div>
                      <div className="text-xs text-red-400/70">Medicare Match<br/>(1.45%)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-yellow-400">
                        ${(periodTotals.grossPay * 0.027).toFixed(2)}
                      </div>
                      <div className="text-xs text-yellow-400/70">SUTA<br/>(2.7%)</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-orange-400">
                        ${(periodTotals.grossPay * 0.005).toFixed(2)}
                      </div>
                      <div className="text-xs text-orange-400/70">Workers Comp<br/>(0.5%)</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-red-800/40">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-red-300">Total Employer Taxes:</span>
                      <span className="text-2xl font-bold text-red-400">
                        ${(periodTotals.grossPay * (0.062 + 0.0145 + 0.027 + 0.005)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-red-800/30">
                      <span className="font-bold text-foreground">TOTAL PAYROLL COST:</span>
                      <span className="text-2xl font-bold text-foreground">
                        ${(periodTotals.grossPay + (periodTotals.grossPay * (0.062 + 0.0145 + 0.027 + 0.005))).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gross Pay + Your Employer Taxes = True cost of employment
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Employee Paystubs */}
              {paystubs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Employee Paychecks ({paystubs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {paystubs.map((paystub) => (
                        <div key={paystub.id} className="flex justify-between items-center p-4 border rounded-lg">
                          <div>
                            <h4 className="font-medium">
                              {paystub.employee.firstName} {paystub.employee.lastName}
                            </h4>
                            <div className="text-sm text-muted-foreground flex items-center gap-4">
                              <span>Check #{paystub.checkNumber}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {parseFloat(paystub.regularHours).toFixed(1)}h regular
                              </span>
                              {parseFloat(paystub.overtimeHours) > 0 && (
                                <span className="text-orange-600">
                                  +{parseFloat(paystub.overtimeHours).toFixed(1)}h overtime
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="font-medium">${parseFloat(paystub.netPay).toFixed(2)}</div>
                              <div className="text-sm text-muted-foreground">
                                ${parseFloat(paystub.grossPay).toFixed(2)} gross
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {selectedPeriod?.status === 'approved' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPaystub(paystub);
                                    setShowPaystubDialog(true);
                                  }}
                                  className="gap-2"
                                >
                                  <Eye className="w-4 h-4" />
                                  View
                                </Button>
                              )}
                              {selectedPeriod?.status === 'calculated' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditPaystub(paystub)}
                                  className="gap-2"
                                >
                                  Edit
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Pay Period</DialogTitle>
            <DialogDescription>Set up a new payroll period for your employees</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pay Frequency</Label>
              <Select 
                value={newPeriodForm.frequency} 
                onValueChange={(value) => setNewPeriodForm({...newPeriodForm, frequency: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={newPeriodForm.startDate}
                  onChange={(e) => setNewPeriodForm({...newPeriodForm, startDate: e.target.value})}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={newPeriodForm.endDate}
                  onChange={(e) => setNewPeriodForm({...newPeriodForm, endDate: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label>Pay Date</Label>
              <Input
                type="date"
                value={newPeriodForm.payDate}
                onChange={(e) => setNewPeriodForm({...newPeriodForm, payDate: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleCreatePeriod} 
              disabled={createPeriodMutation.isPending}
            >
              {createPeriodMutation.isPending ? 'Creating...' : 'Create Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payroll Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Payroll</DialogTitle>
            <DialogDescription>
              Review and approve payroll for {selectedPeriod?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Once approved, this payroll cannot be modified. Please review all paychecks carefully.
              </AlertDescription>
            </Alert>
            <div className="bg-gray-900 border border-gray-700 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Total Employees:</span>
                <span className="font-medium text-sm text-white">{paystubs.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Gross Pay:</span>
                <span className="font-medium text-sm text-green-400">${periodTotals.grossPay.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Total Deductions:</span>
                <span className="font-medium text-sm text-red-400">${periodTotals.deductions.toFixed(2)}</span>
              </div>
              <Separator className="bg-gray-700" />
              <div className="flex justify-between items-center">
                <span className="font-semibold text-white">Net Pay:</span>
                <span className="font-semibold text-green-500">${periodTotals.netPay.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => approvePayrollMutation.mutate({ periodId: selectedPeriod!.id })}
              disabled={approvePayrollMutation.isPending}
            >
              {approvePayrollMutation.isPending ? 'Approving...' : 'Approve Payroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paystub View Dialog */}
      <Dialog open={showPaystubDialog} onOpenChange={setShowPaystubDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Paycheck Details</DialogTitle>
            <DialogDescription>
              {selectedPaystub && `Paycheck for ${selectedPaystub.employee.firstName} ${selectedPaystub.employee.lastName}`}
            </DialogDescription>
          </DialogHeader>
          {selectedPaystub && selectedPeriod && (
            <div className="py-4">
              <ActualPaycheck 
                paycheck={{
                  ...selectedPaystub,
                  payPeriod: {
                    startDate: selectedPeriod.startDate,
                    endDate: selectedPeriod.endDate
                  }
                }} 
                settings={settings} 
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaystubDialog(false)}>Close</Button>
            <Button className="gap-2">
              <Printer className="w-4 h-4" />
              Print Paycheck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Manual Payroll Entry Dialog */}
      <Dialog open={showManualPayrollDialog} onOpenChange={(open) => {
        setShowManualPayrollDialog(open);
        if (!open) setBulkPayrollInputs({}); // Clear inputs when closing dialog
      }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Enter Employee Hours</DialogTitle>
            <DialogDescription>
              Enter hours worked for all employees in this pay period. After submitting, click "Calculate Payroll" to generate paychecks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Employee</TableHead>
                    <TableHead className="w-[100px]">Rate</TableHead>
                    <TableHead className="w-[90px]">Hours</TableHead>
                    <TableHead className="w-[90px]">OT Hours</TableHead>
                    <TableHead className="w-[90px]">Tips ($)</TableHead>
                    <TableHead className="w-[90px]">Bonus ($)</TableHead>
                    <TableHead className="w-[90px]">Deduct ($)</TableHead>
                    <TableHead className="w-[120px]">Gross Pay</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.filter((emp: any) => emp.status === 'active').map((employee: any) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">
                        {employee.firstName} {employee.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        ${employee.hourlyRate || 'N/A'}/hr
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          placeholder="0"
                          value={bulkPayrollInputs[employee.id]?.hours || ''}
                          className="w-20"
                          id={`hours-${employee.id}`}
                          onChange={(e) => handleBulkInputChange(employee.id, 'hours', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          placeholder="0"
                          value={bulkPayrollInputs[employee.id]?.overtime || ''}
                          className="w-20"
                          id={`overtime-${employee.id}`}
                          onChange={(e) => handleBulkInputChange(employee.id, 'overtime', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={bulkPayrollInputs[employee.id]?.tips || ''}
                          className="w-20"
                          id={`tips-${employee.id}`}
                          onChange={(e) => handleBulkInputChange(employee.id, 'tips', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={bulkPayrollInputs[employee.id]?.bonus || ''}
                          className="w-20"
                          id={`bonus-${employee.id}`}
                          onChange={(e) => handleBulkInputChange(employee.id, 'bonus', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={bulkPayrollInputs[employee.id]?.deduction || ''}
                          className="w-20"
                          id={`deduction-${employee.id}`}
                          onChange={(e) => handleBulkInputChange(employee.id, 'deduction', e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {bulkPayrollInputs[employee.id] ? (
                          <span className="text-green-600">
                            ${calculateEmployeeGrossPay(employee, bulkPayrollInputs[employee.id] || {}).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">$0.00</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Optional note..."
                          value={bulkPayrollInputs[employee.id]?.notes || ''}
                          className="w-32"
                          id={`notes-${employee.id}`}
                          onChange={(e) => handleBulkInputChange(employee.id, 'notes', e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowManualPayrollDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleBulkManualPayroll}
              disabled={createManualPayrollMutation.isPending}
            >
              Process All Entries
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Single Paycheck Dialog */}
      <Dialog open={editingPaystub !== null} onOpenChange={(open) => {
        if (!open) {
          setEditingPaystub(null);
          resetManualForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Paycheck</DialogTitle>
            <DialogDescription>
              {editingPaystub && `Editing ${editingPaystub.employee.firstName} ${editingPaystub.employee.lastName}'s paycheck`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hours</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={manualPayrollForm.regularHours}
                  onChange={(e) => setManualPayrollForm({...manualPayrollForm, regularHours: e.target.value})}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
              <div>
                <Label>Rate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualPayrollForm.regularRate}
                  onChange={(e) => setManualPayrollForm({...manualPayrollForm, regularRate: e.target.value})}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bonus ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualPayrollForm.bonuses}
                  onChange={(e) => setManualPayrollForm({...manualPayrollForm, bonuses: e.target.value})}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
              <div>
                <Label>Tips ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualPayrollForm.tips}
                  onChange={(e) => setManualPayrollForm({...manualPayrollForm, tips: e.target.value})}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input
                value={manualPayrollForm.notes}
                onChange={(e) => setManualPayrollForm({...manualPayrollForm, notes: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setEditingPaystub(null);
                resetManualForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => updatePaycheckMutation.mutate({ paycheckId: editingPaystub!.id, data: manualPayrollForm })}
              disabled={updatePaycheckMutation.isPending}
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Hours Dialog (for time entry adjustments) */}
      <Dialog open={showAddHoursDialog} onOpenChange={(open) => {
        setShowAddHoursDialog(open);
        if (!open) setHourAdjustments({});
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Add/Edit Hours</DialogTitle>
            <DialogDescription>
              Add manual time entries for employees. Existing hours from POS systems are shown. After adding hours, click "Recalculate" to update paychecks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {selectedPeriod ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Employee</TableHead>
                      <TableHead className="w-[120px]">Hourly Rate</TableHead>
                      <TableHead className="w-[120px]">Existing Hours</TableHead>
                      <TableHead className="w-[120px]">Hours to Add</TableHead>
                      <TableHead className="w-[150px]">Date</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.filter((emp: any) => emp.status === 'active').map((employee: any) => {
                      const existingHours = calculatedHours.find((h: any) => h.employeeId === employee.id);
                      const totalExisting = existingHours ? (parseFloat(existingHours.regularHours || '0') + parseFloat(existingHours.overtimeHours || '0')) : 0;
                      
                      return (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">
                            {employee.firstName} {employee.lastName}
                          </TableCell>
                          <TableCell>${employee.hourlyRate || 'N/A'}/hr</TableCell>
                          <TableCell>
                            {totalExisting > 0 ? (
                              <span className="text-green-600">{totalExisting.toFixed(2)}h</span>
                            ) : (
                              <span className="text-muted-foreground">0h</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.25"
                              min="0"
                              placeholder="0.00"
                              value={hourAdjustments[employee.id]?.hours || ''}
                              className="w-24"
                              onChange={(e) => setHourAdjustments({
                                ...hourAdjustments,
                                [employee.id]: {
                                  ...hourAdjustments[employee.id],
                                  hours: e.target.value,
                                  date: hourAdjustments[employee.id]?.date || selectedPeriod.startDate
                                }
                              })}
                              onWheel={(e) => e.currentTarget.blur()}
                              data-testid={`input-hours-${employee.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={hourAdjustments[employee.id]?.date || selectedPeriod.startDate}
                              min={selectedPeriod.startDate}
                              max={selectedPeriod.endDate}
                              className="w-36"
                              onChange={(e) => setHourAdjustments({
                                ...hourAdjustments,
                                [employee.id]: {
                                  ...hourAdjustments[employee.id],
                                  hours: hourAdjustments[employee.id]?.hours || '',
                                  date: e.target.value
                                }
                              })}
                              data-testid={`input-date-${employee.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            {totalExisting > 0 ? (
                              <Badge variant="outline" className="bg-green-950 text-green-400 border-green-800">
                                Has Hours
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-yellow-950 text-yellow-400 border-yellow-800">
                                Needs Hours
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Alert>
                <AlertDescription>Please select a pay period first.</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowAddHoursDialog(false)}
              data-testid="button-cancel-hours"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddHours}
              disabled={addTimeEntryMutation.isPending}
              data-testid="button-submit-hours"
            >
              {addTimeEntryMutation.isPending ? 'Adding...' : 'Add Hours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}