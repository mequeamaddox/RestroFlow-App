import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from '@/contexts/LocationContext';
import { Calculator, Building, MapPin, DollarSign, Shield, AlertTriangle } from 'lucide-react';

interface TaxSettings {
  id?: string;
  locationId: string;
  state: string;
  city?: string;
  county?: string;
  
  // Federal tax settings
  federalEmployerId?: string;
  federalTaxRate: string;
  
  // State tax settings
  stateEmployerId?: string;
  stateUnemploymentRate: string; // SUTA rate
  stateDisabilityRate: string;
  stateTaxRate: string;
  
  // Local tax settings
  localTaxRate: string;
  localEmployerId?: string;
  
  // Payroll taxes (fixed by law but editable for different jurisdictions)
  socialSecurityRate: string;
  medicareRate: string;
  
  // Workers compensation
  workersCompRate: string;
  workersCompClass?: string;
  
  // Minimum wage settings
  minimumWage: string;
  tippedMinimumWage: string;
  maxTipCredit: string;
  
  // Overtime rules
  dailyOvertimeThreshold: string;
  weeklyOvertimeThreshold: string;
  doubleTimeThreshold?: string;
  
  isActive: boolean;
  effectiveDate: string;
}

export default function HRTaxSettings() {
  const { currentLocation } = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<TaxSettings>({
    locationId: currentLocation?.id || '',
    state: 'SC', // Default to South Carolina
    federalTaxRate: '0.08',
    stateUnemploymentRate: '0.027', // Default SC SUTA rate
    stateDisabilityRate: '0.000',
    stateTaxRate: '0.02',
    localTaxRate: '0.000',
    socialSecurityRate: '0.062', // Fixed by law
    medicareRate: '0.0145', // Fixed by law
    workersCompRate: '0.005',
    minimumWage: '7.25',
    tippedMinimumWage: '2.13',
    maxTipCredit: '5.12',
    dailyOvertimeThreshold: '8.00',
    weeklyOvertimeThreshold: '40.00',
    isActive: true,
    effectiveDate: new Date().toISOString().split('T')[0],
  });

  // Fetch current tax settings for the selected location
  const { data: taxSettings, isLoading } = useQuery<TaxSettings>({
    queryKey: [`/api/tax-settings?locationId=${currentLocation?.id}`],
    enabled: !!currentLocation?.id,
  });

  // Update form when data loads
  useState(() => {
    if (taxSettings) {
      setFormData(taxSettings);
    }
  });

  // Save tax settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: TaxSettings) => {
      if (data.id) {
        return apiRequest('PUT', `/api/tax-settings/${data.id}`, data);
      } else {
        return apiRequest('POST', '/api/tax-settings', data);
      }
    },
    onSuccess: () => {
      toast({
        title: "Tax Settings Saved",
        description: "Your tax rates and settings have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tax-settings'] });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save tax settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof TaxSettings, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      locationId: currentLocation?.id || '',
    }));
  };

  const handleSave = () => {
    saveSettingsMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  const states = [
    { value: 'SC', label: 'South Carolina' },
    { value: 'NC', label: 'North Carolina' },
    { value: 'GA', label: 'Georgia' },
    { value: 'FL', label: 'Florida' },
    { value: 'TN', label: 'Tennessee' },
    { value: 'VA', label: 'Virginia' },
    // Add more states as needed
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tax Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure tax rates and payroll settings for {currentLocation?.name || 'your location'}
          </p>
        </div>
        <Button 
          onClick={handleSave}
          disabled={saveSettingsMutation.isPending}
          data-testid="save-tax-settings"
        >
          <Calculator className="w-4 h-4 mr-2" />
          {saveSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Changes to tax rates will apply to all new payroll calculations. Existing paystubs will not be affected.
          Consult with your accountant before making changes to ensure compliance.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Location & Federal Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building className="w-5 h-5" />
              <span>Location & Federal Settings</span>
            </CardTitle>
            <CardDescription>
              Basic location information and federal tax settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="state">State</Label>
                <Select value={formData.state} onValueChange={(value) => handleInputChange('state', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map(state => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="city">City (Optional)</Label>
                <Input
                  id="city"
                  value={formData.city || ''}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Enter city"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="federalEmployerId">Federal Employer ID (EIN)</Label>
              <Input
                id="federalEmployerId"
                value={formData.federalEmployerId || ''}
                onChange={(e) => handleInputChange('federalEmployerId', e.target.value)}
                placeholder="XX-XXXXXXX"
              />
            </div>

            <div>
              <Label htmlFor="federalTaxRate">Federal Income Tax Rate (%)</Label>
              <Input
                id="federalTaxRate"
                type="number"
                step="0.001"
                value={parseFloat(formData.federalTaxRate) * 100}
                onChange={(e) => handleInputChange('federalTaxRate', (parseFloat(e.target.value) / 100).toString())}
                placeholder="8.0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current: {(parseFloat(formData.federalTaxRate) * 100).toFixed(1)}% (simplified rate for restaurant workers)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* State & SUTA Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MapPin className="w-5 h-5" />
              <span>State & SUTA Settings</span>
            </CardTitle>
            <CardDescription>
              State-specific tax rates including unemployment insurance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="stateEmployerId">State Employer ID</Label>
              <Input
                id="stateEmployerId"
                value={formData.stateEmployerId || ''}
                onChange={(e) => handleInputChange('stateEmployerId', e.target.value)}
                placeholder="State employer registration number"
              />
            </div>

            <div>
              <Label htmlFor="stateTaxRate">State Income Tax Rate (%)</Label>
              <Input
                id="stateTaxRate"
                type="number"
                step="0.001"
                value={parseFloat(formData.stateTaxRate) * 100}
                onChange={(e) => handleInputChange('stateTaxRate', (parseFloat(e.target.value) / 100).toString())}
                placeholder="2.0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current: {(parseFloat(formData.stateTaxRate) * 100).toFixed(1)}%
              </p>
            </div>

            <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-800/40">
              <Label htmlFor="stateUnemploymentRate" className="font-medium text-yellow-400">
                SUTA Rate (State Unemployment) (%)
              </Label>
              <Input
                id="stateUnemploymentRate"
                type="number"
                step="0.001"
                value={parseFloat(formData.stateUnemploymentRate) * 100}
                onChange={(e) => handleInputChange('stateUnemploymentRate', (parseFloat(e.target.value) / 100).toString())}
                placeholder="2.7"
                className="mt-1"
              />
              <p className="text-xs text-yellow-400/70 mt-1">
                Current: {(parseFloat(formData.stateUnemploymentRate) * 100).toFixed(3)}% 
                (SC default: 2.7%, varies by experience rating)
              </p>
            </div>

            <div>
              <Label htmlFor="stateDisabilityRate">State Disability Insurance Rate (%)</Label>
              <Input
                id="stateDisabilityRate"
                type="number"
                step="0.001"
                value={parseFloat(formData.stateDisabilityRate) * 100}
                onChange={(e) => handleInputChange('stateDisabilityRate', (parseFloat(e.target.value) / 100).toString())}
                placeholder="0.0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                SC does not have state disability insurance
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Payroll Taxes (Employee & Employer) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>Federal Payroll Taxes</span>
            </CardTitle>
            <CardDescription>
              Social Security and Medicare rates (fixed by federal law)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Employee Portion */}
              <div className="space-y-4">
                <h4 className="font-medium text-foreground border-b pb-2">Employee Deductions</h4>
                
                <div>
                  <Label htmlFor="socialSecurityRate">Social Security Rate (%)</Label>
                  <Input
                    id="socialSecurityRate"
                    type="number"
                    step="0.001"
                    value={parseFloat(formData.socialSecurityRate) * 100}
                    onChange={(e) => handleInputChange('socialSecurityRate', (parseFloat(e.target.value) / 100).toString())}
                    placeholder="6.2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Employee portion: {(parseFloat(formData.socialSecurityRate) * 100).toFixed(2)}%
                  </p>
                </div>

                <div>
                  <Label htmlFor="medicareRate">Medicare Rate (%)</Label>
                  <Input
                    id="medicareRate"
                    type="number"
                    step="0.001"
                    value={parseFloat(formData.medicareRate) * 100}
                    onChange={(e) => handleInputChange('medicareRate', (parseFloat(e.target.value) / 100).toString())}
                    placeholder="1.45"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Employee portion: {(parseFloat(formData.medicareRate) * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* Employer Portion */}
              <div className="space-y-4">
                <h4 className="font-medium text-red-300 border-b pb-2 border-red-800/40">Employer Costs</h4>
                
                <div className="bg-red-900/20 p-3 rounded-lg border border-red-800/40">
                  <Label className="text-red-300 font-medium">Social Security (Employer Match)</Label>
                  <p className="text-lg font-bold text-red-400 mt-1">
                    {(parseFloat(formData.socialSecurityRate) * 100).toFixed(2)}%
                  </p>
                  <p className="text-xs text-red-400/70 mt-1">
                    You pay matching {(parseFloat(formData.socialSecurityRate) * 100).toFixed(2)}% on top of wages
                  </p>
                </div>

                <div className="bg-red-900/20 p-3 rounded-lg border border-red-800/40">
                  <Label className="text-red-300 font-medium">Medicare (Employer Match)</Label>
                  <p className="text-lg font-bold text-red-400 mt-1">
                    {(parseFloat(formData.medicareRate) * 100).toFixed(2)}%
                  </p>
                  <p className="text-xs text-red-400/70 mt-1">
                    You pay matching {(parseFloat(formData.medicareRate) * 100).toFixed(2)}% on top of wages
                  </p>
                </div>

                <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-800/40">
                  <Label className="text-yellow-300 font-medium">SUTA (State Unemployment)</Label>
                  <p className="text-lg font-bold text-yellow-400 mt-1">
                    {(parseFloat(formData.stateUnemploymentRate) * 100).toFixed(3)}%
                  </p>
                  <p className="text-xs text-yellow-400/70 mt-1">
                    100% employer cost - employees don't pay SUTA
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Employer-Only Taxes */}
            <div className="space-y-4">
              <h4 className="font-medium text-red-300">Additional Employer-Only Taxes</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-900/20 p-3 rounded-lg border border-red-800/40">
                  <Label className="text-red-300 font-medium">FUTA (Federal Unemployment)</Label>
                  <p className="text-lg font-bold text-red-400 mt-1">0.600%</p>
                  <p className="text-xs text-red-400/70 mt-1">
                    On first $7,000 per employee per year
                  </p>
                </div>

                <div>
                  <Label htmlFor="workersCompRate">Workers' Compensation Rate (%)</Label>
                  <Input
                    id="workersCompRate"
                    type="number"
                    step="0.001"
                    value={parseFloat(formData.workersCompRate) * 100}
                    onChange={(e) => handleInputChange('workersCompRate', (parseFloat(e.target.value) / 100).toString())}
                    placeholder="0.5"
                    className="bg-red-900/20 border-red-800/40"
                  />
                  <p className="text-xs text-red-400/70 mt-1">
                    100% employer cost - varies by industry
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Wage & Overtime Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5" />
              <span>Wage & Overtime Settings</span>
            </CardTitle>
            <CardDescription>
              Minimum wage and overtime calculation rules
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minimumWage">Minimum Wage ($)</Label>
                <Input
                  id="minimumWage"
                  type="number"
                  step="0.01"
                  value={formData.minimumWage}
                  onChange={(e) => handleInputChange('minimumWage', e.target.value)}
                  placeholder="7.25"
                />
              </div>
              <div>
                <Label htmlFor="tippedMinimumWage">Tipped Minimum Wage ($)</Label>
                <Input
                  id="tippedMinimumWage"
                  type="number"
                  step="0.01"
                  value={formData.tippedMinimumWage}
                  onChange={(e) => handleInputChange('tippedMinimumWage', e.target.value)}
                  placeholder="2.13"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="maxTipCredit">Maximum Tip Credit ($)</Label>
              <Input
                id="maxTipCredit"
                type="number"
                step="0.01"
                value={formData.maxTipCredit}
                onChange={(e) => handleInputChange('maxTipCredit', e.target.value)}
                placeholder="5.12"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="weeklyOvertimeThreshold">Weekly OT Threshold (hours)</Label>
                <Input
                  id="weeklyOvertimeThreshold"
                  type="number"
                  step="0.1"
                  value={formData.weeklyOvertimeThreshold}
                  onChange={(e) => handleInputChange('weeklyOvertimeThreshold', e.target.value)}
                  placeholder="40.0"
                />
              </div>
              <div>
                <Label htmlFor="dailyOvertimeThreshold">Daily OT Threshold (hours)</Label>
                <Input
                  id="dailyOvertimeThreshold"
                  type="number"
                  step="0.1"
                  value={formData.dailyOvertimeThreshold}
                  onChange={(e) => handleInputChange('dailyOvertimeThreshold', e.target.value)}
                  placeholder="8.0"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Effective Date */}
      <Card>
        <CardHeader>
          <CardTitle>Effective Date</CardTitle>
          <CardDescription>
            When these settings should take effect for new payroll calculations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Label htmlFor="effectiveDate">Effective Date</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={formData.effectiveDate}
                onChange={(e) => handleInputChange('effectiveDate', e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => handleInputChange('isActive', e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}