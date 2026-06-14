import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from '@/contexts/LocationContext';
import { Building2, Download, CheckCircle, ExternalLink, Users, Clock, DollarSign, Info, FileText } from 'lucide-react';

const PROVIDERS = [
  {
    id: 'gusto',
    name: 'Gusto',
    description: 'Full-service payroll with automated tax filing, benefits, and HR tools. Popular with independent restaurants.',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    setupUrl: 'https://gusto.com',
    features: ['Automated tax filing', 'Benefits management', 'Direct deposit', 'Employee self-service'],
    exportFormat: 'gusto',
  },
  {
    id: 'adp',
    name: 'ADP Run',
    description: 'Enterprise-grade payroll and HR platform. Great for multi-location restaurant groups and chains.',
    color: 'bg-red-500',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
    setupUrl: 'https://www.adp.com/solutions/small-business/payroll.aspx',
    features: ['Multi-state payroll', 'Workers comp', 'Time & attendance sync', 'Compliance tools'],
    exportFormat: 'adp',
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks Payroll',
    description: 'Seamless integration with QuickBooks accounting. Ideal if you already use QuickBooks for bookkeeping.',
    color: 'bg-green-600',
    textColor: 'text-green-400',
    borderColor: 'border-green-600/30',
    setupUrl: 'https://quickbooks.intuit.com/payroll/',
    features: ['Accounting integration', 'Same-day direct deposit', 'Automatic tax payments', 'HR support'],
    exportFormat: 'quickbooks',
  },
  {
    id: 'paychex',
    name: 'Paychex Flex',
    description: 'Scalable payroll platform with strong tip reporting and restaurant-specific compliance features.',
    color: 'bg-blue-500',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    setupUrl: 'https://www.paychex.com',
    features: ['Tip management', 'Restaurant compliance', 'Labor cost reporting', 'Mobile access'],
    exportFormat: 'paychex',
  },
];

const SYNCED_FIELDS = [
  { label: 'Employee Names & IDs', icon: Users, description: 'First name, last name, employee number' },
  { label: 'Regular Hours', icon: Clock, description: 'Hours worked at regular rate per pay period' },
  { label: 'Overtime Hours', icon: Clock, description: 'Hours at 1.5x rate (40+ hrs/week threshold)' },
  { label: 'Gross Pay', icon: DollarSign, description: 'Regular pay + overtime pay before deductions' },
  { label: 'Tips', icon: DollarSign, description: 'Credit card and reported cash tips' },
  { label: 'Bonuses', icon: DollarSign, description: 'One-time bonuses and incentive pay' },
];

export default function HRPayrollProviders() {
  const { toast } = useToast();
  const { currentLocation } = useLocation();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [exportingProvider, setExportingProvider] = useState<string | null>(null);

  const { data: periods = [] } = useQuery<any[]>({
    queryKey: ['/api/payroll-periods', currentLocation?.id],
    enabled: !!currentLocation?.id,
  });

  const approvedPeriods = periods.filter((p: any) => p.status === 'approved' || p.status === 'paid');

  const handleExport = async (providerId: string, format: string) => {
    if (!selectedPeriodId) {
      toast({ title: 'Select a Pay Period', description: 'Choose an approved pay period to export.', variant: 'destructive' });
      return;
    }
    setExportingProvider(providerId);
    try {
      const res = await apiRequest('GET', `/api/payroll/export/${selectedPeriodId}?format=${format}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${format}-${selectedPeriodId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export Ready', description: `Payroll data exported in ${format.toUpperCase()} format. Import this file into your ${PROVIDERS.find(p => p.id === providerId)?.name} account.` });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not generate export. Make sure the pay period is approved.', variant: 'destructive' });
    } finally {
      setExportingProvider(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-400" />
            Payroll Provider Integrations
          </h1>
          <p className="text-slate-400 mt-1">
            Export your employee hours, gross pay, and tips to your payroll provider — they handle all tax withholding and filings.
          </p>
        </div>
      </div>

      <Alert className="bg-blue-500/10 border-blue-500/30 text-blue-300">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>How this works:</strong> RestroFlow tracks your employee hours, POS timeclock data, overtime, tips, and gross pay. 
          You export that data to your payroll provider, who calculates all withholdings (federal, state, FICA) and handles direct 
          deposit, tax filings, and compliance on your behalf.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="providers">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="providers">Payroll Providers</TabsTrigger>
          <TabsTrigger value="export">Export Data</TabsTrigger>
          <TabsTrigger value="whats-synced">What Gets Synced</TabsTrigger>
        </TabsList>

        {/* Provider Cards */}
        <TabsContent value="providers" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PROVIDERS.map((provider) => (
              <Card key={provider.id} className={`bg-slate-800/50 border ${provider.borderColor}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${provider.color} flex items-center justify-center text-white font-bold text-sm`}>
                        {provider.name.slice(0, 2)}
                      </div>
                      <div>
                        <CardTitle className="text-white text-base">{provider.name}</CardTitle>
                        <Badge variant="outline" className={`text-xs mt-0.5 ${provider.textColor} border-current`}>
                          Payroll Provider
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="text-slate-400 text-sm mt-2">
                    {provider.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    {provider.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-slate-700">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2 text-slate-300 border-slate-600"
                      onClick={() => window.open(provider.setupUrl, '_blank')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Visit {provider.name}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        setSelectedPeriodId('');
                        document.querySelector<HTMLElement>('[value="export"]')?.click();
                        toast({ title: `Export for ${provider.name}`, description: 'Select an approved pay period and click Export.' });
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-slate-800/30 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Don't see your provider?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-400 text-sm">
                Any payroll provider that accepts CSV imports (Patriot Software, Rippling, Justworks, Homebase Payroll, etc.) 
                can use our standard export. Go to <strong className="text-slate-300">Export Data</strong> and select "Standard CSV".
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Data Tab */}
        <TabsContent value="export" className="space-y-4 mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Export Payroll Data</CardTitle>
              <CardDescription className="text-slate-400">
                Select an approved pay period and download a CSV formatted for your payroll provider.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-2">Pay Period</label>
                <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white max-w-sm">
                    <SelectValue placeholder="Select approved pay period" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedPeriods.length === 0 ? (
                      <SelectItem value="none" disabled>No approved periods yet</SelectItem>
                    ) : (
                      approvedPeriods.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {new Date(p.startDate).toLocaleDateString()} to {new Date(p.endDate).toLocaleDateString()}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {approvedPeriods.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Approve a pay period in the Payroll page first.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PROVIDERS.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start gap-2 border-slate-600 hover:border-slate-400 text-left"
                    disabled={!selectedPeriodId || exportingProvider === provider.id}
                    onClick={() => handleExport(provider.id, provider.exportFormat)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className={`w-6 h-6 rounded ${provider.color} flex items-center justify-center text-white text-xs font-bold`}>
                        {provider.name.slice(0, 1)}
                      </div>
                      <span className="font-medium text-slate-200">{provider.name}</span>
                      <Download className="w-3.5 h-3.5 ml-auto text-slate-400" />
                    </div>
                    <span className="text-xs text-slate-500">Export as {provider.exportFormat}.csv</span>
                  </Button>
                ))}

                <Button
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2 border-slate-600 hover:border-slate-400 text-left"
                  disabled={!selectedPeriodId || exportingProvider === 'csv'}
                  onClick={() => handleExport('csv', 'csv')}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-6 h-6 rounded bg-slate-500 flex items-center justify-center text-white text-xs font-bold">
                      CSV
                    </div>
                    <span className="font-medium text-slate-200">Standard CSV</span>
                    <Download className="w-3.5 h-3.5 ml-auto text-slate-400" />
                  </div>
                  <span className="text-xs text-slate-500">Works with any provider</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm">Setup Guide</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-slate-400">
                <li className="flex gap-2"><span className="text-blue-400 font-bold">1.</span> Complete your pay period in the Payroll page (Setup → Calculate → Approve)</li>
                <li className="flex gap-2"><span className="text-blue-400 font-bold">2.</span> Return here and select your approved pay period above</li>
                <li className="flex gap-2"><span className="text-blue-400 font-bold">3.</span> Click Export for your payroll provider</li>
                <li className="flex gap-2"><span className="text-blue-400 font-bold">4.</span> Log in to your provider's portal and use their "Import Payroll" or "Bulk Hours" feature</li>
                <li className="flex gap-2"><span className="text-blue-400 font-bold">5.</span> Your provider will calculate all taxes, file forms, and handle direct deposit</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* What Gets Synced Tab */}
        <TabsContent value="whats-synced" className="space-y-4 mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Data Included in Every Export</CardTitle>
              <CardDescription className="text-slate-400">
                The fields your payroll provider needs to process pay and calculate withholdings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SYNCED_FIELDS.map((field) => (
                  <div key={field.label} className="flex items-start gap-3 p-3 rounded-lg bg-slate-700/50">
                    <field.icon className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-slate-200">{field.label}</div>
                      <div className="text-xs text-slate-500">{field.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm">What Your Provider Handles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-400">
                {[
                  'Federal income tax withholding (W-4 based)',
                  'State & local income tax withholding',
                  'Social Security (6.2%) & Medicare (1.45%)',
                  'Employer matching contributions (FICA)',
                  'Quarterly 941 filing (federal)',
                  'State unemployment (SUTA) filings',
                  'FUTA deposits & annual 940 filing',
                  'W-2 generation & delivery',
                  'New hire reporting',
                  'Direct deposit processing',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
