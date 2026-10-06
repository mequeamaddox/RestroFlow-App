import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Clock, User, Phone, Mail, CreditCard, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Employee {
  firstName?: string;
  lastName?: string;
  email?: string;
  position?: string;
  department?: string;
}

export default function PublicOnboardingPage() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState<string>('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(1);

  // Form data state
  const [personalInfo, setPersonalInfo] = useState({
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    dateOfBirth: '',
    ssn: ''
  });

  const [emergencyContact, setEmergencyContact] = useState({
    name: '',
    phone: '',
    relationship: ''
  });

  const [bankingInfo, setBankingInfo] = useState({
    accountNumber: '',
    routingNumber: '',
    bankName: '',
    accountType: 'checking' as 'checking' | 'savings'
  });

  // Each step's fields unmount when you move on, so browser "required" checks never run; check here.
  const digitsOnly = (v: string) => v.replace(/[\s-]/g, '');
  const stepProblem = (step: number): string | null => {
    if (step === 1) {
      const missing = [['phone', 'phone'], ['dateOfBirth', 'date of birth'], ['address', 'address'], ['city', 'city'], ['state', 'state'], ['zipCode', 'ZIP code'], ['ssn', 'Social Security number']]
        .filter(([k]) => !String((personalInfo as any)[k]).trim()).map(([, label]) => label);
      if (missing.length) return `Please enter your ${missing.join(', ')}.`;
      if (!/^\d{9}$/.test(digitsOnly(personalInfo.ssn))) return 'Social Security number must be 9 digits.';
    }
    if (step === 2) {
      if (!emergencyContact.name.trim() || !emergencyContact.phone.trim() || !emergencyContact.relationship) return 'Please complete your emergency contact.';
    }
    if (step === 3) {
      if (!bankingInfo.bankName.trim()) return 'Please enter your bank name.';
      if (!/^\d{9}$/.test(digitsOnly(bankingInfo.routingNumber))) return 'Routing number must be 9 digits.';
      if (!/^\d{4,17}$/.test(digitsOnly(bankingInfo.accountNumber))) return 'Account number must be 4 to 17 digits.';
    }
    return null;
  };
  const goNext = () => {
    const problem = stepProblem(currentStep);
    if (problem) {
      toast({ title: 'Check this step', description: problem, variant: 'destructive' });
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  // Extract token from URL
  useEffect(() => {
    const pathname = location;
    const tokenMatch = pathname.match(/\/onboarding\/(.+)/);
    if (tokenMatch) {
      setToken(tokenMatch[1]);
    }
  }, [location]);

  // Validate token and get employee info
  useEffect(() => {
    if (!token) return;

    const validateToken = async () => {
      try {
        const response = await fetch(`/api/onboarding/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.message || 'Invalid invitation link');
          return;
        }

        setEmployee(data.employee);
      } catch (err) {
        setError('Failed to validate invitation link');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const step of [1, 2, 3]) {
      const problem = stepProblem(step);
      if (problem) {
        setCurrentStep(step);
        toast({ title: 'Check this step', description: problem, variant: 'destructive' });
        return;
      }
    }
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/onboarding/${token}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalInfo,
          emergencyContact,
          bankingInfo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to complete onboarding');
      }

      toast({
        title: "Welcome to the team!",
        description: data.message,
      });

      // Show success page
      setCurrentStep(5);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to complete onboarding',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-blue-600" />
            <h2 className="text-xl font-semibold mb-2">Validating Invitation</h2>
            <p className="text-muted-foreground">Please wait while we verify your invitation link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-600" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Please contact your manager for a new invitation link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === 5) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h2 className="text-2xl font-semibold mb-2">Welcome to the Team!</h2>
            <p className="text-muted-foreground mb-4">
              Your employee information has been saved. You can now sign in on the website or in the Android app.
            </p>
            <p className="text-sm text-muted-foreground">
              You'll receive further instructions from your manager about your first day.
            </p>
            <Button className="mt-4" onClick={() => window.location.assign('/login')}>Continue to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const steps = [
    { number: 1, title: 'Personal Information', icon: User },
    { number: 2, title: 'Emergency Contact', icon: Phone },
    { number: 3, title: 'Banking Details', icon: CreditCard },
    { number: 4, title: 'Review & Submit', icon: FileText }
  ];

  return (
    <div className="min-h-screen bg-muted py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Employee Onboarding</h1>
          <p className="text-muted-foreground">
            Welcome {employee?.firstName} {employee?.lastName}! Please complete your onboarding information.
          </p>
          {(employee?.position || employee?.department) && (
            <p className="text-sm text-muted-foreground mt-1">
              {[employee.position && `Position: ${employee.position}`, employee.department && `Department: ${employee.department}`].filter(Boolean).join(' • ')}
            </p>
          )}
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;
              
              return (
                <div key={step.number} className="flex items-center">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    isCompleted ? 'bg-green-600 border-green-600 text-white' :
                    isActive ? 'bg-blue-600 border-blue-600 text-white' :
                    'bg-card border-border text-gray-400'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <Icon className="w-6 h-6" />
                    )}
                  </div>
                  <div className="ml-3">
                    <p className={`text-sm font-medium ${isActive ? 'text-blue-600' : 'text-muted-foreground'}`}>
                      Step {step.number}
                    </p>
                    <p className={`text-sm ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                      {step.title}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 ${
                      isCompleted ? 'bg-green-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <Card>
          <form onSubmit={handleSubmit}>
            {/* Step 1: Personal Information */}
            {currentStep === 1 && (
              <CardContent className="p-6">
                <CardTitle className="mb-4">Personal Information</CardTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={personalInfo.phone}
                      onChange={(e) => setPersonalInfo({...personalInfo, phone: e.target.value})}
                      placeholder="+1 (555) 123-4567"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={personalInfo.dateOfBirth}
                      onChange={(e) => setPersonalInfo({...personalInfo, dateOfBirth: e.target.value})}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="address">Home Address</Label>
                    <Input
                      id="address"
                      value={personalInfo.address}
                      onChange={(e) => setPersonalInfo({...personalInfo, address: e.target.value})}
                      placeholder="123 Main Street"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={personalInfo.city}
                      onChange={(e) => setPersonalInfo({...personalInfo, city: e.target.value})}
                      placeholder="New York"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={personalInfo.state}
                      onChange={(e) => setPersonalInfo({...personalInfo, state: e.target.value})}
                      placeholder="NY"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      value={personalInfo.zipCode}
                      onChange={(e) => setPersonalInfo({...personalInfo, zipCode: e.target.value})}
                      placeholder="10001"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="ssn">Social Security Number</Label>
                    <Input
                      id="ssn"
                      type="password"
                      value={personalInfo.ssn}
                      onChange={(e) => setPersonalInfo({...personalInfo, ssn: e.target.value})}
                      placeholder="XXX-XX-XXXX"
                      required
                    />
                  </div>
                </div>
              </CardContent>
            )}

            {/* Step 2: Emergency Contact */}
            {currentStep === 2 && (
              <CardContent className="p-6">
                <CardTitle className="mb-4">Emergency Contact</CardTitle>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="emergencyName">Full Name</Label>
                    <Input
                      id="emergencyName"
                      value={emergencyContact.name}
                      onChange={(e) => setEmergencyContact({...emergencyContact, name: e.target.value})}
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="emergencyPhone">Phone Number</Label>
                    <Input
                      id="emergencyPhone"
                      type="tel"
                      value={emergencyContact.phone}
                      onChange={(e) => setEmergencyContact({...emergencyContact, phone: e.target.value})}
                      placeholder="+1 (555) 123-4567"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="relationship">Relationship</Label>
                    <Select
                      value={emergencyContact.relationship}
                      onValueChange={(value) => setEmergencyContact({...emergencyContact, relationship: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spouse">Spouse</SelectItem>
                        <SelectItem value="parent">Parent</SelectItem>
                        <SelectItem value="sibling">Sibling</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="friend">Friend</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            )}

            {/* Step 3: Banking Information */}
            {currentStep === 3 && (
              <CardContent className="p-6">
                <CardTitle className="mb-4">Banking Information</CardTitle>
                <Alert className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This information is encrypted and used only for direct deposit payroll processing.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      value={bankingInfo.bankName}
                      onChange={(e) => setBankingInfo({...bankingInfo, bankName: e.target.value})}
                      placeholder="Chase Bank"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="routingNumber">Routing Number</Label>
                    <Input
                      id="routingNumber"
                      value={bankingInfo.routingNumber}
                      onChange={(e) => setBankingInfo({...bankingInfo, routingNumber: e.target.value})}
                      placeholder="021000021"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      type="password"
                      value={bankingInfo.accountNumber}
                      onChange={(e) => setBankingInfo({...bankingInfo, accountNumber: e.target.value})}
                      placeholder="Enter account number"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountType">Account Type</Label>
                    <Select value={bankingInfo.accountType} onValueChange={(value: 'checking' | 'savings') => setBankingInfo({...bankingInfo, accountType: value})}>
                      <SelectTrigger id="accountType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            )}

            {/* Step 4: Review */}
            {currentStep === 4 && (
              <CardContent className="p-6">
                <CardTitle className="mb-4">Review Your Information</CardTitle>
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-foreground mb-2">Personal Information</h3>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                      <p><span className="font-medium">Phone:</span> {personalInfo.phone}</p>
                      <p><span className="font-medium">Date of Birth:</span> {personalInfo.dateOfBirth}</p>
                      <p><span className="font-medium">Address:</span> {personalInfo.address}, {personalInfo.city}, {personalInfo.state} {personalInfo.zipCode}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-foreground mb-2">Emergency Contact</h3>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                      <p><span className="font-medium">Name:</span> {emergencyContact.name}</p>
                      <p><span className="font-medium">Phone:</span> {emergencyContact.phone}</p>
                      <p><span className="font-medium">Relationship:</span> {emergencyContact.relationship}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-foreground mb-2">Banking Information</h3>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                      <p><span className="font-medium">Bank:</span> {bankingInfo.bankName}</p>
                      <p><span className="font-medium">Routing Number:</span> {bankingInfo.routingNumber}</p>
                      <p><span className="font-medium">Account Number:</span> ****{bankingInfo.accountNumber.slice(-4)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}

            {/* Navigation */}
            <div className="flex justify-between p-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
              >
                Previous
              </Button>
              
              {currentStep < 4 ? (
                <Button
                  type="button"
                  onClick={goNext}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Complete Onboarding'}
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}