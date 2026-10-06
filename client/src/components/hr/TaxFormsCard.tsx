import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Landmark, ShieldCheck } from "lucide-react";
import { CITIZENSHIP_LABELS, FILING_STATUS_LABELS, I9_EMPLOYER_ATTESTATION, i9Section2Schema } from "@shared/taxForms";

type Doc = { title: string; issuingAuthority: string; number: string; expiration?: string };
interface TaxForms {
  w4?: {
    filingStatus: keyof typeof FILING_STATUS_LABELS; multipleJobs: boolean; dependentsAmount: number; otherIncome: number;
    deductions: number; extraWithholding: number; exempt: boolean; formVersion: string; signedName: string; signedAt: string;
  };
  i9?: {
    formVersion: string; status: "employee_signed" | "complete"; section2DueDate?: string;
    section1: { citizenship: keyof typeof CITIZENSHIP_LABELS; workAuthExpiration?: string; uscisNumber?: string; i94Number?: string; foreignPassportNumber?: string; passportCountry?: string; signedName: string; signedAt: string };
    section2?: { firstDayOfEmployment: string; documentChoice: "list_a" | "list_b_c"; listA?: Doc[]; listB?: Doc; listC?: Doc; employerName: string; employerTitle: string; signedAt: string; alternativeProcedure?: boolean };
  };
}

const emptyDoc: Doc = { title: "", issuingAuthority: "", number: "", expiration: "" };
const usd = (n?: number) => `$${Number(n || 0).toLocaleString()}`;
const day = (d?: string) => (d ? new Date(d).toLocaleDateString() : "—");

function DocFields({ label, value, onChange }: { label: string; value: Doc; onChange: (d: Doc) => void }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>Document title</Label><Input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} placeholder="e.g. U.S. Passport" /></div>
        <div><Label>Issuing authority</Label><Input value={value.issuingAuthority} onChange={e => onChange({ ...value, issuingAuthority: e.target.value })} /></div>
        <div><Label>Document number</Label><Input value={value.number} onChange={e => onChange({ ...value, number: e.target.value })} /></div>
        <div><Label>Expiration (if any)</Label><Input type="date" value={value.expiration} onChange={e => onChange({ ...value, expiration: e.target.value })} /></div>
      </div>
    </div>
  );
}

export function TaxFormsCard({ employeeId, canManage, hireDate, businessName }: { employeeId: string; canManage: boolean; hireDate?: string; businessName?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstDayOfEmployment: hireDate?.slice(0, 10) || "",
    documentChoice: "list_a" as "list_a" | "list_b_c",
    listA: { ...emptyDoc }, listB: { ...emptyDoc }, listC: { ...emptyDoc },
    additionalInfo: "", alternativeProcedure: false,
    employerName: "", employerTitle: "", businessName: businessName || "", businessAddress: "", attest: false,
  });

  const { data, isLoading } = useQuery<TaxForms>({ queryKey: [`/api/employees/${employeeId}/tax-forms`] });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        listA: form.documentChoice === "list_a" ? [form.listA] : undefined,
        listB: form.documentChoice === "list_b_c" ? form.listB : undefined,
        listC: form.documentChoice === "list_b_c" ? form.listC : undefined,
      };
      const parsed = i9Section2Schema.safeParse(payload);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
      return (await apiRequest("POST", `/api/employees/${employeeId}/i9-section2`, payload)).json();
    },
    onSuccess: () => {
      toast({ title: "Section 2 saved", description: "Form I-9 is complete." });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${employeeId}/tax-forms`] });
      setOpen(false);
    },
    onError: (error: Error) => {
      let message = error.message;
      try { message = JSON.parse(message.replace(/^\d+:\s*/, "")).message || message; } catch {}
      toast({ title: "Couldn't save Section 2", description: message, variant: "destructive" });
    },
  });

  const w4 = data?.w4;
  const i9 = data?.i9;
  const overdue = i9?.status === "employee_signed" && i9.section2DueDate && i9.section2DueDate < new Date().toISOString().slice(0, 10);

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" /> Tax &amp; Work Eligibility</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Form W-4</h3>
            {w4 ? <Badge className="bg-green-900/30 text-green-400 border border-green-800">Signed {day(w4.signedAt)}</Badge> : <Badge variant="outline">{isLoading ? "Loading…" : "Not submitted"}</Badge>}
          </div>
          {w4 && (
            <div className="text-sm space-y-1 text-muted-foreground">
              {w4.exempt ? <p className="text-foreground">Claims exemption from withholding</p> : <>
                <p><span className="text-foreground">Filing status:</span> {FILING_STATUS_LABELS[w4.filingStatus]}</p>
                <p><span className="text-foreground">Multiple jobs (2c):</span> {w4.multipleJobs ? "Yes" : "No"}</p>
                <p><span className="text-foreground">Dependents (3):</span> {usd(w4.dependentsAmount)}</p>
                <p><span className="text-foreground">Other income (4a):</span> {usd(w4.otherIncome)} · <span className="text-foreground">Deductions (4b):</span> {usd(w4.deductions)}</p>
                <p><span className="text-foreground">Extra withholding (4c):</span> {usd(w4.extraWithholding)} per pay period</p>
              </>}
              <p className="text-xs">{w4.formVersion} · signed by {w4.signedName}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Form I-9</h3>
            {!i9 ? <Badge variant="outline">{isLoading ? "Loading…" : "Not submitted"}</Badge>
              : i9.status === "complete" ? <Badge className="bg-green-900/30 text-green-400 border border-green-800">Complete</Badge>
              : <Badge className={overdue ? "bg-red-900/30 text-red-400 border border-red-800" : "bg-yellow-900/30 text-yellow-400 border border-yellow-800"}>{overdue ? "Section 2 overdue" : "Section 2 needed"}</Badge>}
          </div>
          {i9 && (
            <div className="text-sm space-y-1 text-muted-foreground">
              <p><span className="text-foreground">Section 1:</span> {CITIZENSHIP_LABELS[i9.section1.citizenship]}</p>
              {i9.section1.workAuthExpiration && <p><span className="text-foreground">Authorized until:</span> {i9.section1.workAuthExpiration}</p>}
              {i9.section1.uscisNumber && <p><span className="text-foreground">USCIS / A-Number:</span> {i9.section1.uscisNumber}</p>}
              {i9.section1.i94Number && <p><span className="text-foreground">I-94:</span> {i9.section1.i94Number}</p>}
              {i9.section1.foreignPassportNumber && <p><span className="text-foreground">Passport:</span> {i9.section1.foreignPassportNumber} ({i9.section1.passportCountry})</p>}
              <p className="text-xs">Signed by {i9.section1.signedName} on {day(i9.section1.signedAt)}</p>
              {i9.section2 ? (
                <div className="pt-2">
                  <p><span className="text-foreground">Section 2:</span> first day {i9.section2.firstDayOfEmployment}; {i9.section2.documentChoice === "list_a"
                    ? `List A: ${i9.section2.listA?.map(d => `${d.title} ${d.number}`).join(", ")}`
                    : `List B: ${i9.section2.listB?.title} ${i9.section2.listB?.number}; List C: ${i9.section2.listC?.title} ${i9.section2.listC?.number}`}</p>
                  <p className="text-xs">Reviewed by {i9.section2.employerName}, {i9.section2.employerTitle} on {day(i9.section2.signedAt)}</p>
                </div>
              ) : (
                <div className="pt-2 space-y-2">
                  {i9.section2DueDate && <p className={overdue ? "text-red-400" : ""}>Section 2 due by {i9.section2DueDate} (3 business days after the first day of work).</p>}
                  {canManage && <Button size="sm" onClick={() => setOpen(true)}>Complete Section 2</Button>}
                </div>
              )}
              <p className="text-xs">{i9.formVersion}</p>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Form I-9 Section 2: Employer review</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Physically examine original, unexpired documents the employee chooses to present: one from List A, or one from List B and one from List C. Don't ask for specific documents.</p>
            <div className="max-w-xs">
              <Label>Employee's first day of employment</Label>
              <Input type="date" value={form.firstDayOfEmployment} onChange={e => setForm({ ...form, firstDayOfEmployment: e.target.value })} />
            </div>
            <RadioGroup value={form.documentChoice} onValueChange={v => setForm({ ...form, documentChoice: v as "list_a" | "list_b_c" })} className="flex gap-6">
              <div className="flex items-center gap-2"><RadioGroupItem value="list_a" id="docA" /><Label htmlFor="docA" className="font-normal">List A document</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="list_b_c" id="docBC" /><Label htmlFor="docBC" className="font-normal">List B + List C documents</Label></div>
            </RadioGroup>
            {form.documentChoice === "list_a"
              ? <DocFields label="List A (identity and employment authorization)" value={form.listA} onChange={d => setForm({ ...form, listA: d })} />
              : <>
                  <DocFields label="List B (identity)" value={form.listB} onChange={d => setForm({ ...form, listB: d })} />
                  <DocFields label="List C (employment authorization)" value={form.listC} onChange={d => setForm({ ...form, listC: d })} />
                </>}
            <div><Label>Additional information (optional)</Label><Textarea value={form.additionalInfo} onChange={e => setForm({ ...form, additionalInfo: e.target.value })} /></div>
            <div className="flex items-start gap-2">
              <Checkbox id="altProc" checked={form.alternativeProcedure} onCheckedChange={v => setForm({ ...form, alternativeProcedure: v === true })} />
              <Label htmlFor="altProc" className="font-normal">I used an alternative procedure authorized by DHS to examine documents (E-Verify employers only).</Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Your full name</Label><Input value={form.employerName} onChange={e => setForm({ ...form, employerName: e.target.value })} /></div>
              <div><Label>Your title</Label><Input value={form.employerTitle} onChange={e => setForm({ ...form, employerTitle: e.target.value })} /></div>
              <div><Label>Business name</Label><Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} /></div>
              <div><Label>Business address</Label><Input value={form.businessAddress} onChange={e => setForm({ ...form, businessAddress: e.target.value })} placeholder="Street, city, state ZIP" /></div>
            </div>
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm">{I9_EMPLOYER_ATTESTATION}</p>
              <div className="flex items-start gap-2">
                <Checkbox id="empAttest" checked={form.attest} onCheckedChange={v => setForm({ ...form, attest: v === true })} />
                <Label htmlFor="empAttest" className="font-normal">I agree, and I'm signing electronically.</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Sign and complete"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
