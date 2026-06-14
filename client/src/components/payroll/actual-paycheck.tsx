import React from 'react';

interface ActualPaycheckProps {
  paycheck: {
    checkNumber: string;
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
    payDate: string;
    payPeriod: {
      startDate: string;
      endDate: string;
    };
    employee: {
      firstName: string;
      lastName: string;
      address: string;
      phone: string;
      ssn?: string;
      employeeNumber?: string;
    };
  };
  settings?: {
    companyName?: string;
    taxFilingName?: string;
    lastCheckNumber?: string;
    displayBusinessName?: boolean;
    displayTaxFilingName?: boolean;
    displayLast4Ssn?: boolean;
    printSignature?: boolean;
    paycheckLayout?: string;
    bankName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyEin?: string;
  };
}

export function ActualPaycheck({ paycheck, settings }: ActualPaycheckProps) {
  const layout = settings?.paycheckLayout || 'check_on_top';
  
  const safeFormatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Invalid Date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString();
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const convertNumberToWords = (num: number): string => {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const thousands = ['', 'THOUSAND', 'MILLION'];

    if (num === 0) return 'ZERO';
    if (num < 0) return 'NEGATIVE ' + convertNumberToWords(-num);

    let result = '';
    let thousandIndex = 0;

    while (num > 0) {
      const chunk = num % 1000;
      if (chunk !== 0) {
        let chunkWords = '';
        
        const hundreds = Math.floor(chunk / 100);
        if (hundreds > 0) {
          chunkWords += ones[hundreds] + ' HUNDRED ';
        }
        
        const remainder = chunk % 100;
        if (remainder >= 20) {
          chunkWords += tens[Math.floor(remainder / 10)] + ' ';
          if (remainder % 10 > 0) {
            chunkWords += ones[remainder % 10] + ' ';
          }
        } else if (remainder >= 10) {
          chunkWords += teens[remainder - 10] + ' ';
        } else if (remainder > 0) {
          chunkWords += ones[remainder] + ' ';
        }
        
        chunkWords += thousands[thousandIndex] + ' ';
        result = chunkWords + result;
      }
      
      num = Math.floor(num / 1000);
      thousandIndex++;
    }
    
    return result.trim();
  };

  const formatSSN = (ssn: string | undefined) => {
    if (!settings?.displayLast4Ssn || !ssn) return '';
    return `***-**-${ssn.slice(-4)}`;
  };

  const netAmount = parseFloat(paycheck.netPay);
  const dollarAmount = Math.floor(netAmount);
  const centsAmount = Math.round((netAmount % 1) * 100);
  const amountInWords = convertNumberToWords(dollarAmount);

  // Render check portion component (reusable)
  const CheckPortion = () => (
    <div className="border-b-2 border-dashed border-gray-400 pb-4 mb-4" style={{ minHeight: '3.5in', padding: '0.5in' }}>
      <div className="flex justify-between items-start mb-4">
        <div className="text-sm font-bold leading-tight">
          {settings?.companyName || 'Business Name'}<br/>
          {settings?.companyAddress || 'Business Address'}<br/>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold">{settings?.bankName || 'Bank Name'}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">{paycheck.checkNumber}</div>
          <div className="text-sm mt-2">{safeFormatDate(paycheck.payDate)}</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm mb-1">PAY TO THE ORDER OF</div>
        <div className="text-lg font-bold border-b border-black pb-1">
          {paycheck.employee.firstName} {paycheck.employee.lastName}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="flex-1 mr-4">
          <div className="text-xs mb-1">AMOUNT IN WORDS</div>
          <div className="text-sm font-bold border-b border-black pb-1">
            {amountInWords} DOLLARS AND {centsAmount.toString().padStart(2, '0')}/100 CENTS
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs mb-1">$</div>
          <div className="text-xl font-bold border border-black px-2 py-1">
            {parseFloat(paycheck.netPay).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <div className="text-xs mb-1">MEMO</div>
          <div className="text-sm border-b border-black pb-1" style={{ width: '200px' }}>
            Payroll - {safeFormatDate(paycheck.payPeriod?.startDate)} to {safeFormatDate(paycheck.payPeriod?.endDate)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm border-b border-black pb-1" style={{ width: '200px' }}>
            {settings?.printSignature ? 'AUTHORIZED SIGNATURE' : ''}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-center">
        C{paycheck.checkNumber}C A053906041A 123456789C
      </div>
    </div>
  );

  // Render pay stub portion component (reusable)
  const PayStubPortion = () => (
    <div className="p-4 bg-gray-50" style={{ minHeight: '4.5in' }}>
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold">{settings?.companyName}</h2>
        <p className="text-sm">Employee Pay Stub</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="font-bold mb-2">{paycheck.employee.firstName} {paycheck.employee.lastName}</div>
          <div className="text-sm space-y-1">
            <div>{paycheck.employee.address}</div>
            <div>{paycheck.employee.phone}</div>
            {settings?.displayLast4Ssn && paycheck.employee.ssn && (
              <div>SSN: {formatSSN(paycheck.employee.ssn)}</div>
            )}
            {paycheck.employee.employeeNumber && (
              <div>Employee ID: {paycheck.employee.employeeNumber}</div>
            )}
          </div>
        </div>

        <div>
          <div className="font-bold mb-2">{settings?.companyName}</div>
          <div className="text-sm space-y-1">
            <div>{settings?.companyAddress}</div>
            {settings?.companyPhone && <div>{settings.companyPhone}</div>}
            {settings?.companyEin && <div>SC EIN: {settings.companyEin}</div>}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t pt-4">
        <div className="grid grid-cols-3 gap-2 text-sm mb-2">
          <div className="font-bold">Pay Period:</div>
          <div className="col-span-2">{safeFormatDate(paycheck.payPeriod?.startDate)} - {safeFormatDate(paycheck.payPeriod?.endDate)}</div>
          <div className="font-bold">Pay Date:</div>
          <div className="col-span-2">{safeFormatDate(paycheck.payDate)}</div>
          <div className="font-bold">Check Number:</div>
          <div className="col-span-2">{paycheck.checkNumber}</div>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <h3 className="font-bold mb-2">EARNINGS</h3>
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div className="font-semibold">Description</div>
          <div className="font-semibold text-right">Hours</div>
          <div className="font-semibold text-right">Rate</div>
          <div className="font-semibold text-right">Amount</div>
          
          <div>Regular Pay</div>
          <div className="text-right">{parseFloat(paycheck.regularHours).toFixed(2)}</div>
          <div className="text-right">${parseFloat(paycheck.regularRate).toFixed(2)}</div>
          <div className="text-right">${parseFloat(paycheck.regularPay).toFixed(2)}</div>
          
          {parseFloat(paycheck.overtimeHours) > 0 && (
            <>
              <div>Overtime Pay</div>
              <div className="text-right">{parseFloat(paycheck.overtimeHours).toFixed(2)}</div>
              <div className="text-right">${parseFloat(paycheck.overtimeRate).toFixed(2)}</div>
              <div className="text-right">${parseFloat(paycheck.overtimePay).toFixed(2)}</div>
            </>
          )}
          
          <div className="col-span-3 font-bold border-t pt-2">GROSS PAY</div>
          <div className="font-bold border-t pt-2 text-right">${parseFloat(paycheck.grossPay).toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center text-sm text-blue-700">
          Taxes &amp; withholdings processed by your connected payroll provider
        </div>
      </div>

      <div className="mt-6 bg-green-50 border-2 border-green-600 p-4 rounded">
        <div className="flex justify-between items-center">
          <div className="text-lg font-bold">GROSS PAY</div>
          <div className="text-2xl font-bold text-green-700">${parseFloat(paycheck.grossPay).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );

  // Layout switching based on settings
  switch (layout) {
    case 'no_printing':
      return (
        <div className="bg-white text-black p-8 text-center" style={{ width: '8.5in', margin: '0 auto' }}>
          <div className="text-2xl font-bold mb-4">Digital Pay Stub Only</div>
          <p className="text-gray-600">This paycheck is configured for digital-only distribution</p>
        </div>
      );

    case 'check_stub_only':
      return (
        <div className="bg-white text-black font-mono print:p-0" style={{ width: '8.5in', margin: '0 auto' }}>
          <PayStubPortion />
        </div>
      );

    case 'check_on_bottom':
      return (
        <div className="bg-white text-black font-mono print:p-0" style={{ width: '8.5in', margin: '0 auto' }}>
          <PayStubPortion />
          <div className="border-t-2 border-dashed border-gray-400 mt-4">
            <CheckPortion />
          </div>
        </div>
      );

    case 'check_on_top':
    default:
      return (
        <div className="bg-white text-black font-mono print:p-0" style={{ width: '8.5in', margin: '0 auto' }}>
          <CheckPortion />
          <PayStubPortion />
        </div>
      );
  }
}
