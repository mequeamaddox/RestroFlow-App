import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Settings, FileText, Printer, CheckCircle, CircleX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePermissions, Permission } from "@/contexts/PermissionContext";
import { PaycheckGenerator } from "@/components/payroll/paycheck-generator";

interface PaycheckSettings {
  id?: string;
  paycheckLayout: 'no_printing' | 'check_stub_only' | 'check_on_top' | 'check_on_bottom';
  displayLast4Ssn: boolean;
  displayTaxFilingName: boolean;
  displayBusinessName: boolean;
  printSignature: boolean;
  showLastCheckNumber: boolean;
  businessName?: string;
  taxFilingName?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEin?: string;
  bankName?: string;
  lastCheckNumber?: number;
  locationId?: string;
}

const LAYOUT_OPTIONS = [
  {
    id: 'no_printing',
    title: 'No Printing Needed',
    description: 'Digital pay stubs only - no physical printing required',
    icon: CircleX,
    preview: '🚫',
    disabled: false
  },
  {
    id: 'check_stub_only',
    title: 'Check Stub Only',
    description: 'Print pay stub without check portion',
    icon: FileText,
    preview: '📄',
    selected: true
  },
  {
    id: 'check_on_top',
    title: 'Check On Top',
    description: 'Check at top, stub information below',
    icon: FileText,
    preview: '💳\n📝',
    checkMark: true
  },
  {
    id: 'check_on_bottom',
    title: 'Check On Bottom',
    description: 'Stub information at top, check below',
    icon: FileText,
    preview: '📝\n💳'
  }
];

export default function HRPaycheckSettings() {
  const [selectedLayout, setSelectedLayout] = useState<string>('check_stub_only');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  const { data: settings, isLoading } = useQuery<PaycheckSettings>({
    queryKey: ['/api/payroll/paycheck-settings'],
  });

  // Update selected layout when settings load
  React.useEffect(() => {
    if (settings?.paycheckLayout) {
      setSelectedLayout(settings.paycheckLayout);
    }
  }, [settings]);

  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ['/api/locations'],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<PaycheckSettings>) => {
      return await apiRequest('PUT', '/api/payroll/paycheck-settings', data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Paycheck settings updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/payroll/paycheck-settings'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update paycheck settings", variant: "destructive" });
    },
  });

  const handleLayoutChange = (layoutId: string) => {
    setSelectedLayout(layoutId);
    updateSettingsMutation.mutate({ paycheckLayout: layoutId as any });
  };

  const handleOptionChange = (option: keyof PaycheckSettings, value: boolean | string | number) => {
    updateSettingsMutation.mutate({ [option]: value });
  };

  const canManage = hasPermission(Permission.MANAGE_EMPLOYEES);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded-md w-64 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6" data-testid="paycheck-settings-page">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-foreground">Paycheck & Pay Stub Settings</h1>
        </div>
        <p className="text-muted-foreground">
          Configure your paycheck layout options and pay stub printing preferences.
        </p>
      </div>

      {/* Paycheck Layout Selection */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Paycheck Layout Options
          </CardTitle>
          <CardDescription>
            Select the paycheck layout option that matches your check stock.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            value={selectedLayout} 
            onValueChange={handleLayoutChange}
            disabled={!canManage}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {LAYOUT_OPTIONS.map((option) => (
              <div key={option.id} className="relative">
                <RadioGroupItem
                  value={option.id}
                  id={option.id}
                  className="sr-only"
                  data-testid={`layout-${option.id}`}
                />
                <Label
                  htmlFor={option.id}
                  className={`
                    flex flex-col items-center p-6 border-2 rounded-lg cursor-pointer transition-all
                    hover:shadow-md hover:border-blue-300
                    ${selectedLayout === option.id 
                      ? 'border-blue-500 bg-blue-900/20 shadow-md' 
                      : 'border-border bg-card'
                    }
                    ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {/* Preview Visual */}
                  <div className="text-4xl mb-3">
                    {option.id === 'no_printing' && '🚫'}
                    {option.id === 'check_stub_only' && (
                      <div className="flex flex-col items-center space-y-1">
                        <div className="w-16 h-3 bg-gray-300 rounded"></div>
                        <div className="w-16 h-3 bg-gray-300 rounded"></div>
                        <div className="w-16 h-3 bg-gray-300 rounded"></div>
                      </div>
                    )}
                    {option.id === 'check_on_top' && (
                      <div className="flex flex-col items-center space-y-2">
                        <div className="w-16 h-2 bg-blue-300 rounded border border-gray-400"></div>
                        <div className="w-16 h-4 bg-gray-300 rounded"></div>
                      </div>
                    )}
                    {option.id === 'check_on_bottom' && (
                      <div className="flex flex-col items-center space-y-2">
                        <div className="w-16 h-4 bg-gray-300 rounded"></div>
                        <div className="w-16 h-2 bg-blue-300 rounded border border-gray-400"></div>
                      </div>
                    )}
                  </div>

                  <h3 className="font-semibold text-center mb-2">{option.title}</h3>
                  <p className="text-sm text-muted-foreground text-center">{option.description}</p>
                  
                  {selectedLayout === option.id && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="h-6 w-6 text-blue-600" />
                    </div>
                  )}
                  
                  {option.checkMark && selectedLayout === option.id && (
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}
                </Label>
                
                {/* Select Button */}
                <Button
                  variant={selectedLayout === option.id ? "default" : "outline"}
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => handleLayoutChange(option.id)}
                  disabled={!canManage || option.disabled}
                  data-testid={`select-${option.id}`}
                >
                  {selectedLayout === option.id ? 'Selected' : 'Select'}
                </Button>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Print Sample Link */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <span className="font-medium">Generate Sample Check</span>
              <span className="text-sm text-muted-foreground">- Uses live settings</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              data-testid="print-sample-button"
              onClick={() => {
                const previewElement = document.querySelector('[data-testid="live-preview"]');
                if (previewElement) {
                  previewElement.scrollIntoView({ behavior: 'smooth' });
                  toast({ title: "Live Preview", description: "Scroll down to see your paycheck with current settings" });
                } else {
                  toast({ title: "Generating Preview", description: "Live preview showing actual paycheck format" });
                }
              }}
            >
              View Live Sample
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Business Information */}
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>
            Configure your business details that appear on paychecks and pay stubs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="businessName" className="text-sm font-medium">
              Business Operating Name
            </Label>
            <Input
              id="businessName"
              value={settings?.businessName || ''}
              onChange={(e) => handleOptionChange('businessName', e.target.value)}
              placeholder="Enter your business operating name"
              disabled={!canManage}
              data-testid="input-business-name"
            />
            <p className="text-xs text-muted-foreground">
              This name appears on employee paychecks
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="taxFilingName" className="text-sm font-medium">
              Legal Tax Filing Name
            </Label>
            <Input
              id="taxFilingName"
              value={settings?.taxFilingName || ''}
              onChange={(e) => handleOptionChange('taxFilingName', e.target.value)}
              placeholder="Enter your legal business name for tax filings"
              disabled={!canManage}
              data-testid="input-tax-filing-name"
            />
            <p className="text-xs text-muted-foreground">
              Legal entity name used for tax reporting and compliance
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lastCheckNumber" className="text-sm font-medium">
              Starting Check Number
            </Label>
            <Input
              id="lastCheckNumber"
              type="number"
              value={settings?.lastCheckNumber || 1000}
              onChange={(e) => handleOptionChange('lastCheckNumber', parseInt(e.target.value) || 1000)}
              placeholder="1000"
              disabled={!canManage}
              data-testid="input-check-number"
            />
            <p className="text-xs text-muted-foreground">
              Next check number to be used for payroll
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Additional Options */}
      <Card>
        <CardHeader>
          <CardTitle>Display Options</CardTitle>
          <CardDescription>
            Configure additional display options for your paychecks and pay stubs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="displayLast4Ssn"
              checked={(settings as any)?.displayLast4Ssn || false}
              onCheckedChange={(checked) => handleOptionChange('displayLast4Ssn', !!checked)}
              disabled={!canManage}
              data-testid="checkbox-display-ssn"
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="displayLast4Ssn" className="text-sm font-medium">
                Display Last 4 Digits of Employee SSN on Check Stub
              </Label>
              <p className="text-xs text-muted-foreground">
                Shows last 4 digits for identification purposes
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-3">
            <Checkbox
              id="displayTaxFilingName"
              checked={(settings as any)?.displayTaxFilingName || false}
              onCheckedChange={(checked) => handleOptionChange('displayTaxFilingName', !!checked)}
              disabled={!canManage}
              data-testid="checkbox-tax-filing-name"
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="displayTaxFilingName" className="text-sm font-medium">
                Display Tax Filing Name on Check Stub: {settings?.taxFilingName || 'Your Tax Filing Name'}
              </Label>
              <p className="text-xs text-muted-foreground">
                Shows your legal business name for tax purposes
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-3">
            <Checkbox
              id="displayBusinessName"
              checked={(settings as any)?.displayBusinessName || false}
              onCheckedChange={(checked) => handleOptionChange('displayBusinessName', !!checked)}
              disabled={!canManage}
              data-testid="checkbox-business-name"
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="displayBusinessName" className="text-sm font-medium">
                Display Business Name on Check Stub: {settings?.businessName || 'Your Business Name'}
              </Label>
              <p className="text-xs text-muted-foreground">
                Shows your business operating name
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-3">
            <Checkbox
              id="printSignature"
              checked={(settings as any)?.printSignature || false}
              onCheckedChange={(checked) => handleOptionChange('printSignature', !!checked)}
              disabled={!canManage}
              data-testid="checkbox-print-signature"
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="printSignature" className="text-sm font-medium">
                Print E-Signature on Checks
              </Label>
              <p className="text-xs text-muted-foreground">
                Includes digital signature on printed checks
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-3">
            <Checkbox
              id="showLastCheckNumber"
              checked={(settings as any)?.showLastCheckNumber || false}
              onCheckedChange={(checked) => handleOptionChange('showLastCheckNumber', !!checked)}
              disabled={!canManage}
              data-testid="checkbox-check-number"
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="showLastCheckNumber" className="text-sm font-medium">
                Show last check number used
              </Label>
              <p className="text-xs text-muted-foreground">
                Displays the most recent check number for reference: #{settings?.lastCheckNumber || 1000}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Live Preview
          </CardTitle>
          <CardDescription>
            See how your paycheck settings will look with actual data
          </CardDescription>
        </CardHeader>
        <CardContent data-testid="live-preview">
          <PaycheckGenerator 
            settings={{
              ...settings,
              paycheckLayout: selectedLayout
            }}
            employee={{
              firstName: "John",
              lastName: "Smith", 
              employeeId: "EMP001",
              ssn: "123456789"
            }}
            paycheck={{
              payPeriodStart: "01/01/2025",
              payPeriodEnd: "01/15/2025",
              payDate: "01/18/2025",
              regularHours: "80.00",
              regularPay: "1600.00",
              overtimeHours: "5.00", 
              overtimePay: "187.50",
              grossPay: "1787.50",
              federalTax: "268.13",
              stateTax: "89.38",
              socialSecurity: "110.83",
              medicare: "25.92",
              totalDeductions: "494.26",
              netPay: "1293.24"
            }}
          />
        </CardContent>
      </Card>

      {!canManage && (
        <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-800/40 rounded-lg">
          <p className="text-sm text-yellow-400">
            <strong>Note:</strong> You need management permissions to modify paycheck settings.
          </p>
        </div>
      )}
    </div>
  );
}