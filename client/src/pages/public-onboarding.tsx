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
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Landmark, ShieldCheck } from 'lucide-react';
import {
  w4Schema, i9Section1Schema, W4_ATTESTATION, I9_EMPLOYEE_ATTESTATION, W4_DEPENDENT_AMOUNTS,
  FILING_STATUS_LABELS, CITIZENSHIP_LABELS, W4_FORM_VERSION, I9_FORM_VERSION,
} from '@shared/taxForms';

const W4_STEP = 4;
const I9_STEP = 5;
const REVIEW_STEP = 6;
const DONE_STEP = 7;

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

  const [w4, setW4] = useState({
    filingStatus: '' as '' | keyof typeof FILING_STATUS_LABELS,
    multipleJobs: false,
    qualifyingChildren: '0',
    otherDependents: '0',
    dependentsAmount: '',
    otherIncome: '',
    deductions: '',
    extraWithholding: '',
    exempt: false,
    signedName: '',
    attest: false,
  });
  const [i9, setI9] = useState({
    middleInitial: '',
    otherLastNames: '',
    email: '',
    citizenship: '' as '' | keyof typeof CITIZENSHIP_LABELS,
    uscisNumber: '',
    workAuthExpiration: '',
    i94Number: '',
    foreignPassportNumber: '',
    passportCountry: '',
    noPreparer: false,
    signedName: '',
    attest: false,
  });
  const suggestedDependents = Number(w4.qualifyingChildren || 0) * W4_DEPENDENT_AMOUNTS.qualifyingChild + Number(w4.otherDependents || 0) * W4_DEPENDENT_AMOUNTS.otherDependent;
  const w4Payload = () => ({ ...w4, dependentsAmount: w4.dependentsAmount === '' ? suggestedDependents : w4.dependentsAmount, filingStatus: w4.filingStatus || undefined });
  const i9Payload = () => ({ ...i9, citizenship: i9.citizenship || undefined, email: i9.email || employee?.email || '' });

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
    if (step === W4_STEP) {
      const result = w4Schema.safeParse(w4Payload());
      if (!result.success) return result.error.issues[0]?.message || 'Please complete Form W-4.';
    }
    if (step === I9_STEP) {
      const result = i9Section1Schema.safeParse(i9Payload());
      if (!result.success) return result.error.issues[0]?.message || 'Please complete Form I-9.';
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
    for (const step of [1, 2, 3, W4_STEP, I9_STEP]) {
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
          w4: w4Payload(),
          i9: i9Payload(),
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
      setCurrentStep(DONE_STEP);
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

  if (currentStep === DONE_STEP) {
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
    { number: W4_STEP, title: 'Form W-4', icon: Landmark },
    { number: I9_STEP, title: 'Form I-9', icon: ShieldCheck },
    { number: REVIEW_STEP, title: 'Review & Submit', icon: FileText }
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
                <div key={step.number} className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
                  <div className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-full border-2 ${
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
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${
                      isCompleted ? 'bg-green-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-3">
            Step {Math.min(currentStep, steps.length)} of {steps.length} · {steps.find(step => step.number === currentStep)?.title}
          </p>
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


            {/* Step 4: Form W-4 */}
            {currentStep === W4_STEP && (
              <CardContent className="p-6 space-y-6">
                <div>
                  <CardTitle>Employee's Withholding Certificate</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{W4_FORM_VERSION}. This tells payroll how much federal income tax to withhold. Your name, address and SSN come from Step 1.</p>
                </div>

                <div className="space-y-2">
                  <Label>Step 1(c): Filing status</Label>
                  <RadioGroup value={w4.filingStatus} onValueChange={(v) => setW4({ ...w4, filingStatus: v as keyof typeof FILING_STATUS_LABELS })}>
                    {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => (
                      <div key={value} className="flex items-center gap-2">
                        <RadioGroupItem value={value} id={`fs-${value}`} />
                        <Label htmlFor={`fs-${value}`} className="font-normal">{label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox id="exempt" checked={w4.exempt} onCheckedChange={(v) => setW4({ ...w4, exempt: v === true })} />
                  <Label htmlFor="exempt" className="font-normal leading-snug">
                    I claim exemption from withholding (I had no federal income tax liability last year and expect none this year). Steps 2–4 are skipped.
                  </Label>
                </div>

                {!w4.exempt && (
                  <>
                    <div className="flex items-start gap-2">
                      <Checkbox id="multipleJobs" checked={w4.multipleJobs} onCheckedChange={(v) => setW4({ ...w4, multipleJobs: v === true })} />
                      <Label htmlFor="multipleJobs" className="font-normal leading-snug">
                        Step 2(c): I hold more than one job at a time, or I'm married filing jointly and my spouse also works, and there are only two jobs total.
                      </Label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="qualifyingChildren">Step 3: Qualifying children under 17</Label>
                        <Input id="qualifyingChildren" type="number" min={0} value={w4.qualifyingChildren} onChange={(e) => setW4({ ...w4, qualifyingChildren: e.target.value, dependentsAmount: '' })} />
                      </div>
                      <div>
                        <Label htmlFor="otherDependents">Other dependents</Label>
                        <Input id="otherDependents" type="number" min={0} value={w4.otherDependents} onChange={(e) => setW4({ ...w4, otherDependents: e.target.value, dependentsAmount: '' })} />
                      </div>
                      <div>
                        <Label htmlFor="dependentsAmount">Total for dependents ($)</Label>
                        <Input id="dependentsAmount" inputMode="decimal" value={w4.dependentsAmount === '' ? String(suggestedDependents) : w4.dependentsAmount} onChange={(e) => setW4({ ...w4, dependentsAmount: e.target.value })} />
                        <p className="text-xs text-muted-foreground mt-1">Only if your income is $200,000 or less ($400,000 if married filing jointly). Adjust if needed.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="otherIncome">Step 4(a): Other income, not from jobs ($/yr)</Label>
                        <Input id="otherIncome" inputMode="decimal" placeholder="0" value={w4.otherIncome} onChange={(e) => setW4({ ...w4, otherIncome: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="deductions">Step 4(b): Deductions beyond the standard ($/yr)</Label>
                        <Input id="deductions" inputMode="decimal" placeholder="0" value={w4.deductions} onChange={(e) => setW4({ ...w4, deductions: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="extraWithholding">Step 4(c): Extra withholding per paycheck ($)</Label>
                        <Input id="extraWithholding" inputMode="decimal" placeholder="0" value={w4.extraWithholding} onChange={(e) => setW4({ ...w4, extraWithholding: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm">{W4_ATTESTATION}</p>
                  <div className="flex items-start gap-2">
                    <Checkbox id="w4attest" checked={w4.attest} onCheckedChange={(v) => setW4({ ...w4, attest: v === true })} />
                    <Label htmlFor="w4attest" className="font-normal">I agree, and I'm signing electronically.</Label>
                  </div>
                  <div>
                    <Label htmlFor="w4sign">Step 5: Type your full legal name to sign</Label>
                    <Input id="w4sign" value={w4.signedName} onChange={(e) => setW4({ ...w4, signedName: e.target.value })} placeholder={`${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim()} />
                  </div>
                </div>
              </CardContent>
            )}

            {/* Step 5: Form I-9 Section 1 */}
            {currentStep === I9_STEP && (
              <CardContent className="p-6 space-y-6">
                <div>
                  <CardTitle>Employment Eligibility Verification — Section 1</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{I9_FORM_VERSION}. Federal law requires this by your first day of work. Your manager will review your documents in Section 2.</p>
                </div>

                <div className="bg-muted p-4 rounded-lg text-sm space-y-1">
                  <p><span className="font-medium">Name:</span> {employee?.lastName}, {employee?.firstName}</p>
                  <p><span className="font-medium">Address:</span> {personalInfo.address}, {personalInfo.city}, {personalInfo.state} {personalInfo.zipCode}</p>
                  <p><span className="font-medium">Date of birth:</span> {personalInfo.dateOfBirth}</p>
                  <p className="text-xs text-muted-foreground">Taken from Step 1. Go back to change them.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="middleInitial">Middle initial</Label>
                    <Input id="middleInitial" maxLength={1} value={i9.middleInitial} onChange={(e) => setI9({ ...i9, middleInitial: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="otherLastNames">Other last names used</Label>
                    <Input id="otherLastNames" value={i9.otherLastNames} onChange={(e) => setI9({ ...i9, otherLastNames: e.target.value })} placeholder="None" />
                  </div>
                  <div>
                    <Label htmlFor="i9email">Email (optional)</Label>
                    <Input id="i9email" type="email" value={i9.email} onChange={(e) => setI9({ ...i9, email: e.target.value })} placeholder={employee?.email} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>I attest, under penalty of perjury, that I am (check one):</Label>
                  <RadioGroup value={i9.citizenship} onValueChange={(v) => setI9({ ...i9, citizenship: v as keyof typeof CITIZENSHIP_LABELS })}>
                    {Object.entries(CITIZENSHIP_LABELS).map(([value, label], index) => (
                      <div key={value} className="flex items-center gap-2">
                        <RadioGroupItem value={value} id={`cz-${value}`} />
                        <Label htmlFor={`cz-${value}`} className="font-normal">{index + 1}. {label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {i9.citizenship === 'permanent_resident' && (
                  <div className="max-w-sm">
                    <Label htmlFor="uscisNumber">USCIS Number / A-Number</Label>
                    <Input id="uscisNumber" value={i9.uscisNumber} onChange={(e) => setI9({ ...i9, uscisNumber: e.target.value })} placeholder="A123456789" />
                  </div>
                )}

                {i9.citizenship === 'authorized_alien' && (
                  <div className="space-y-4">
                    <div className="max-w-sm">
                      <Label htmlFor="workAuthExpiration">Work authorization expiration date</Label>
                      <Input id="workAuthExpiration" type="date" value={i9.workAuthExpiration === 'N/A' ? '' : i9.workAuthExpiration} disabled={i9.workAuthExpiration === 'N/A'} onChange={(e) => setI9({ ...i9, workAuthExpiration: e.target.value })} />
                      <div className="flex items-center gap-2 mt-2">
                        <Checkbox id="noExpiration" checked={i9.workAuthExpiration === 'N/A'} onCheckedChange={(v) => setI9({ ...i9, workAuthExpiration: v === true ? 'N/A' : '' })} />
                        <Label htmlFor="noExpiration" className="font-normal">My authorization doesn't expire (N/A)</Label>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">Enter one of the following:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="uscisNumber2">USCIS Number / A-Number</Label>
                        <Input id="uscisNumber2" value={i9.uscisNumber} onChange={(e) => setI9({ ...i9, uscisNumber: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="i94Number">Form I-94 admission number</Label>
                        <Input id="i94Number" value={i9.i94Number} onChange={(e) => setI9({ ...i9, i94Number: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="foreignPassportNumber">Foreign passport number</Label>
                        <Input id="foreignPassportNumber" value={i9.foreignPassportNumber} onChange={(e) => setI9({ ...i9, foreignPassportNumber: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="passportCountry">Country of issuance</Label>
                        <Input id="passportCountry" value={i9.passportCountry} onChange={(e) => setI9({ ...i9, passportCountry: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Checkbox id="noPreparer" checked={i9.noPreparer} onCheckedChange={(v) => setI9({ ...i9, noPreparer: v === true })} />
                    <Label htmlFor="noPreparer" className="font-normal">I completed this section myself, without a preparer or translator.</Label>
                  </div>
                  <p className="text-sm">{I9_EMPLOYEE_ATTESTATION}</p>
                  <div className="flex items-start gap-2">
                    <Checkbox id="i9attest" checked={i9.attest} onCheckedChange={(v) => setI9({ ...i9, attest: v === true })} />
                    <Label htmlFor="i9attest" className="font-normal">I agree, and I'm signing electronically.</Label>
                  </div>
                  <div>
                    <Label htmlFor="i9sign">Type your full legal name to sign</Label>
                    <Input id="i9sign" value={i9.signedName} onChange={(e) => setI9({ ...i9, signedName: e.target.value })} placeholder={`${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim()} />
                  </div>
                </div>
              </CardContent>
            )}

            {/* Step 6: Review */}
            {currentStep === REVIEW_STEP && (
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

                  <div>
                    <h3 className="font-medium text-foreground mb-2">Form W-4</h3>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                      {w4.exempt ? <p>Claiming exemption from withholding</p> : <>
                        <p><span className="font-medium">Filing status:</span> {w4.filingStatus ? FILING_STATUS_LABELS[w4.filingStatus] : '—'}</p>
                        <p><span className="font-medium">Multiple jobs:</span> {w4.multipleJobs ? 'Yes' : 'No'}</p>
                        <p><span className="font-medium">Dependents:</span> ${w4Payload().dependentsAmount || 0}</p>
                        {Number(w4.extraWithholding) > 0 && <p><span className="font-medium">Extra withholding:</span> ${w4.extraWithholding} per paycheck</p>}
                      </>}
                      <p><span className="font-medium">Signed:</span> {w4.signedName}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-foreground mb-2">Form I-9 Section 1</h3>
                    <div className="bg-muted p-4 rounded-lg space-y-2">
                      <p><span className="font-medium">Status:</span> {i9.citizenship ? CITIZENSHIP_LABELS[i9.citizenship] : '—'}</p>
                      <p><span className="font-medium">Signed:</span> {i9.signedName}</p>
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
              
              {/* Distinct keys: reusing one element lets the Next click turn into a submit. */}
              {currentStep < REVIEW_STEP ? (
                <Button
                  key="next"
                  type="button"
                  onClick={goNext}
                >
                  Next
                </Button>
              ) : (
                <Button
                  key="submit"
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