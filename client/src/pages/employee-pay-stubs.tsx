import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { 
  Download, 
  Eye, 
  FileText, 
  DollarSign, 
  Calendar, 
  TrendingUp,
  Printer,
  TrendingDown,
  Minus
} from 'lucide-react';
import { format } from 'date-fns';
import { ActualPaycheck } from '@/components/payroll/actual-paycheck';

interface EmployeePaystub {
  id: string;
  payPeriodId: string;
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
  payPeriod: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    payDate: string;
    frequency: string;
    status: string;
  };
  employee?: {
    firstName: string;
    lastName: string;
    address: string | null;
    phone: string;
  };
}

interface PayrollSummary {
  totalGrossPay: number;
  totalNetPay: number;
  totalDeductions: number;
  averageHours: number;
  yearToDateGross: number;
  yearToDateNet: number;
  yearToDateTaxes: number;
}

export default function EmployeePayStubs() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedPaystub, setSelectedPaystub] = useState<EmployeePaystub | null>(null);
  const [showPaystubDialog, setShowPaystubDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Helper function to safely format dates
  const safeFormatDate = (dateString: string | null | undefined, formatString: string): string => {
    if (!dateString) return 'Invalid Date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, formatString);
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const userId = (user as any)?.id || (user as any)?.claims?.sub;

  // Fetch employee pay stubs
  const { data: paystubs = [], isLoading: paystubsLoading } = useQuery<EmployeePaystub[]>({
    queryKey: ['/api/employee/pay-stubs', userId, selectedYear],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/employee/${userId}/pay-stubs?year=${selectedYear}`);
      return response.json();
    },
    enabled: !!userId,
  });

  // Fetch payroll summary
  const { data: summary } = useQuery<PayrollSummary>({
    queryKey: ['/api/employee/payroll-summary', userId, selectedYear],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/employee/${userId}/payroll-summary?year=${selectedYear}`);
      return response.json();
    },
    enabled: !!userId,
  });

  // Get paycheck settings for display
  const { data: settings } = useQuery({
    queryKey: ['/api/payroll/paycheck-settings'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payroll/paycheck-settings');
      return response.json();
    },
  });

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-900/30 text-green-400 border border-green-800">Paid</Badge>;
      case 'calculated':
        return <Badge className="bg-blue-900/30 text-blue-400 border border-blue-800">Ready</Badge>;
      case 'draft':
        return <Badge className="bg-accent text-foreground border-border">Processing</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const yearOptions = [];
  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year >= currentYear - 3; year--) {
    yearOptions.push(year.toString());
  }

  if (paystubsLoading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="employee-pay-stubs-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-white" data-testid="page-title">My Pay Stubs</h1>
          <p className="text-slate-300">View your paycheck history and earnings summary</p>
        </div>
        
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map(year => (
              <SelectItem key={year} value={year}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700/50" data-testid="card-total-earnings">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">YTD Gross Pay</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(summary.yearToDateGross)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700/50" data-testid="card-total-deductions">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">YTD Net Pay</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(summary.yearToDateNet)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700/50" data-testid="card-total-net-pay">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">YTD Taxes</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(summary.yearToDateTaxes)}
                  </p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">Avg Hours/Pay</p>
                  <p className="text-2xl font-bold text-white">
                    {summary.averageHours.toFixed(1)}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pay Stubs List */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Pay Stubs for {selectedYear}</CardTitle>
          <CardDescription className="text-slate-400">
            View and download your pay stubs from recent pay periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paystubs.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No pay stubs found</h3>
              <p className="text-slate-400">You don't have any pay stubs for {selectedYear} yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paystubs.map((paystub) => (
                <div
                  key={paystub.id}
                  className="flex items-center justify-between p-4 border border-slate-600 rounded-lg hover:bg-slate-800/30 bg-slate-800/20"
                  data-testid={`paystub-row-${paystub.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <div>
                        <h4 className="font-medium text-white">
                          {paystub.payPeriod?.name || 'Pay Period'}
                        </h4>
                        <p className="text-sm text-slate-400">
                          {paystub.payPeriod?.startDate && paystub.payPeriod?.endDate ? (
                            <>
                              {safeFormatDate(paystub.payPeriod.startDate, 'MMM d')} - {safeFormatDate(paystub.payPeriod.endDate, 'MMM d, yyyy')}
                            </>
                          ) : (
                            `Pay Date: ${safeFormatDate(paystub.payDate, 'MMM d, yyyy')}`
                          )}
                        </p>
                      </div>
                      {getStatusBadge(paystub.status)}
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {formatCurrency(paystub.netPay)}
                      </p>
                      <p className="text-sm text-slate-400">
                        Net Pay
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {formatCurrency(paystub.grossPay)}
                      </p>
                      <p className="text-sm text-slate-400">
                        Gross Pay
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {(parseFloat(paystub.regularHours) + parseFloat(paystub.overtimeHours)).toFixed(1)}h
                      </p>
                      <p className="text-sm text-slate-400">
                        Total Hours
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPaystub(paystub);
                          setShowPaystubDialog(true);
                        }}
                        className="gap-2"
                        data-testid={`view-paystub-${paystub.id}`}
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pay Stub Detail Dialog */}
      <Dialog open={showPaystubDialog} onOpenChange={setShowPaystubDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Pay Stub Details</DialogTitle>
            {selectedPaystub && (
              <DialogDescription className="text-slate-400">
                {selectedPaystub.payPeriod?.name || 'Pay Period'} - Pay Date: {safeFormatDate(selectedPaystub.payDate, 'MMM d, yyyy')}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedPaystub && (
            <div className="py-4">
              <ActualPaycheck 
                paycheck={{
                  ...selectedPaystub,
                  employee: selectedPaystub.employee || {
                    firstName: 'Employee',
                    lastName: 'Name',
                    address: '123 Main St',
                    phone: '(555) 123-4567'
                  }
                }} 
                settings={settings} 
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaystubDialog(false)}>
              Close
            </Button>
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
            <Button className="gap-2">
              <Printer className="w-4 h-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}