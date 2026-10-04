import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Upload, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  DollarSign,
  TrendingUp,
  AlertCircle,
  Download,
  Eye,
  Camera,
  FileImage,
  Scan,
  Trash2,
  Package,
  Edit3
} from "lucide-react";
import { format } from "date-fns";
import { InvoiceReviewDialog } from "@/components/invoice-review-dialog";
import { useLocation } from "@/contexts/LocationContext";
import LocationBanner from "@/components/location/location-banner";

const invoiceSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().optional(),
  subtotal: z.number().min(0, "Subtotal must be positive"),
  tax: z.number().min(0, "Tax must be positive").default(0),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

export default function InvoiceProcessing() {
  const { toast } = useToast();
  const { currentLocation } = useLocation();
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [reviewInvoice, setReviewInvoice] = useState<any>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/invoices", statusFilter, currentLocation?.id],
    queryFn: async () => {
      const urlParams = new URLSearchParams();
      if (statusFilter !== "all") urlParams.append("status", statusFilter);
      if (currentLocation?.id) urlParams.append("locationId", currentLocation.id);
      const params = urlParams.toString() ? `?${urlParams.toString()}` : "";
      return apiRequest("GET", `/api/invoices${params}`).then(r => r.json());
    },
    enabled: !!currentLocation,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors", currentLocation?.id],
    queryFn: () => apiRequest("GET", `/api/vendors?locationId=${currentLocation?.id}`).then(r => r.json()),
    enabled: !!currentLocation,
  });

  const { data: processingStats } = useQuery({
    queryKey: ["/api/invoices/stats", currentLocation?.id],
    queryFn: () => {
      const params = currentLocation?.id ? `?locationId=${currentLocation.id}` : "";
      return apiRequest("GET", `/api/invoices/stats${params}`).then(r => r.json());
    },
    enabled: !!currentLocation,
  });

  // Mutations
  const uploadInvoiceMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentLocation) {
        throw new Error("Please select a location before uploading");
      }
      
      const formData = new FormData();
      formData.append("invoice", file);
      formData.append("locationId", currentLocation.id);

      const response = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Upload failed");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "OCR Processing Complete",
        description: `Invoice processed with ${data.ocrConfidence}% confidence`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/stats"] });
      setUploadProgress(0);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const response = await apiRequest("POST", "/api/invoices", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to create invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/invoices/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest("DELETE", `/api/invoices/${id}`),
    onSuccess: () => {
      toast({ 
        title: "Invoice deleted",
        description: "Invoice has been successfully deleted"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      subtotal: 0,
      tax: 0,
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG, or PDF file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    try {
      await uploadInvoiceMutation.mutateAsync(file);
      setUploadProgress(100);
    } catch (error) {
      clearInterval(progressInterval);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: "bg-yellow-500", label: "Pending" },
      processing: { color: "bg-blue-500", label: "Processing" },
      approved: { color: "bg-green-500", label: "Approved" },
      paid: { color: "bg-emerald-500", label: "Paid" },
      rejected: { color: "bg-red-500", label: "Rejected" },
      overdue: { color: "bg-orange-500", label: "Overdue" },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-8">
      <LocationBanner />
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Invoice Processing</h1>
          <p className="text-slate-300 mt-2">Automated invoice management and approval workflow</p>
        </div>
        <div className="flex gap-3">
          <Button 
            className="bg-gradient-to-r from-orange-400 to-red-500 hover:from-orange-500 hover:to-red-600 text-white shadow-lg"
            onClick={triggerFileUpload}
            disabled={isUploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isUploading ? "Processing..." : "Upload Invoice"}
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg,application/pdf,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />

          {isUploading && (
            <div className="flex items-center gap-3 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Scan className="h-4 w-4 animate-pulse text-orange-400" />
                Processing with OCR...
              </div>
              <div className="text-sm text-orange-400 font-medium">{uploadProgress}%</div>
              <Progress value={uploadProgress} className="h-2 w-20" />
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Total Invoices</p>
                <p className="text-2xl font-bold text-white">{processingStats?.totalInvoices || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Pending</p>
                <p className="text-2xl font-bold text-white">{processingStats?.pendingCount || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-orange-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Overdue</p>
                <p className="text-2xl font-bold text-white">{processingStats?.overdueCount || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-400" />
              <div className="ml-4">
                <p className="text-sm text-slate-400">Total Amount</p>
                <p className="text-2xl font-bold text-white">${processingStats?.totalAmount?.toLocaleString() || '0'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Invoice List */}
      <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-white">Invoice Management</CardTitle>
              <CardDescription className="text-slate-400 mt-1">
                View, approve, and manage all invoices. Click the eye icon to see detailed information.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48 bg-slate-700 border-slate-600 text-white">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/invoices"] })}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-300">Invoice #</TableHead>
                <TableHead className="text-slate-300">Vendor</TableHead>
                <TableHead className="text-slate-300">Date</TableHead>
                <TableHead className="text-slate-300">Amount</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    Loading invoices...
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice: any) => (
                  <TableRow key={invoice.id} className="border-slate-700 hover:bg-slate-800/50 cursor-pointer">
                    <TableCell className="text-white font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-slate-300">{invoice.vendor?.name || invoice.vendorName}</TableCell>
                    <TableCell className="text-slate-300">
                      {invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'MMM dd, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell className="text-slate-300">${(invoice.totalAmount || invoice.total || 0).toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        {/* Review Button - Opens editable dialog */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReviewInvoice({
                              id: invoice.id,
                              locationId: invoice.locationId || invoice.location_id || currentLocation?.id,
                              inventoryReceivedAt: invoice.inventoryReceivedAt,
                              vendor: invoice.vendor?.name || invoice.vendorName || '',
                              invoiceNumber: invoice.invoiceNumber,
                              invoiceDate: invoice.invoiceDate,
                              total: invoice.totalAmount || invoice.total || 0,
                              subtotal: invoice.subtotal || 0,
                              lineItems: invoice.lineItems || [],
                              fees: invoice.fees || [],
                              ocrConfidence: invoice.ocrConfidence || 0,
                              attachmentPath: invoice.attachmentPath
                            });
                            setIsReviewOpen(true);
                          }}
                          className="text-blue-400 hover:text-blue-300"
                          title="Review & Edit Invoice"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Button>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedInvoice(invoice)}
                              title="View Invoice Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-slate-900 border-slate-700">
                            <DialogHeader>
                              <DialogTitle className="text-white text-xl">
                                Invoice Details - {invoice.invoiceNumber}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                              {/* Basic Information */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                                  Basic Information
                                </h3>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Invoice Number:</span>
                                    <span className="text-white font-medium">{invoice.invoiceNumber}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Vendor:</span>
                                    <span className="text-white">{invoice.vendor?.name || invoice.vendorName || 'N/A'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Date:</span>
                                    <span className="text-white">
                                      {invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'MMM dd, yyyy') : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Due Date:</span>
                                    <span className="text-white">
                                      {invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM dd, yyyy') : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Status:</span>
                                    <div>{getStatusBadge(invoice.status)}</div>
                                  </div>
                                </div>
                              </div>

                              {/* Financial Information */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                                  Financial Details
                                </h3>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Subtotal:</span>
                                    <span className="text-white">${(invoice.subtotal || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Tax:</span>
                                    <span className="text-white">${(invoice.tax || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-slate-700 pt-2">
                                    <span className="text-slate-400 font-semibold">Total Amount:</span>
                                    <span className="text-green-400 font-bold text-lg">
                                      ${(invoice.totalAmount || invoice.total || 0).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* OCR Information (if available) */}
                              {invoice.ocrConfidence && (
                                <div className="md:col-span-2 space-y-4">
                                  <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                                    OCR Processing
                                  </h3>
                                  <div className="bg-slate-800 rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="text-slate-400">OCR Confidence:</span>
                                      <span className={`font-medium ${
                                        invoice.ocrConfidence > 80 ? 'text-green-400' :
                                        invoice.ocrConfidence > 60 ? 'text-yellow-400' : 'text-red-400'
                                      }`}>
                                        {invoice.ocrConfidence}%
                                      </span>
                                    </div>
                                    <div className="text-sm text-slate-400">
                                      Upload Method: {invoice.uploadMethod || 'Manual'}
                                    </div>
                                    {invoice.processedAt && (
                                      <div className="text-sm text-slate-400">
                                        Processed: {format(new Date(invoice.processedAt), 'MMM dd, yyyy HH:mm')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Line Items (if available) */}
                              {invoice.lineItems && invoice.lineItems.length > 0 && (
                                <div className="md:col-span-2 space-y-4">
                                  <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2 flex items-center gap-2">
                                    Line Items
                                    <span className="text-sm text-slate-400 font-normal">
                                      ({invoice.lineItems.length} items)
                                    </span>
                                  </h3>
                                  <div className="bg-slate-800 rounded-lg overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="border-slate-700">
                                          <TableHead className="text-slate-300">Description</TableHead>
                                          <TableHead className="text-slate-300 text-right">Qty</TableHead>
                                          <TableHead className="text-slate-300 text-right">Unit Price</TableHead>
                                          <TableHead className="text-slate-300 text-right">Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {invoice.lineItems.map((item: any, index: number) => (
                                          <TableRow key={index} className="border-slate-700">
                                            <TableCell className="text-slate-300 font-medium">
                                              {item.description || 'Unknown Item'}
                                            </TableCell>
                                            <TableCell className="text-slate-300 text-right">
                                              {item.quantity || 1}
                                            </TableCell>
                                            <TableCell className="text-slate-300 text-right">
                                              ${(item.unitPrice || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-green-400 text-right font-medium">
                                              ${(item.totalPrice || 0).toFixed(2)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                        <TableRow className="border-slate-600 bg-slate-700/50">
                                          <TableCell colSpan={3} className="text-slate-300 font-semibold">
                                            Total from Line Items:
                                          </TableCell>
                                          <TableCell className="text-green-400 text-right font-bold">
                                            ${invoice.lineItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0).toFixed(2)}
                                          </TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              )}

                              {/* Original Text (if available) */}
                              {invoice.originalText && (
                                <div className="md:col-span-2 space-y-4">
                                  <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                                    Extracted Text
                                  </h3>
                                  <div className="bg-slate-800 rounded-lg p-4 max-h-40 overflow-y-auto">
                                    <pre className="text-sm text-slate-300 whitespace-pre-wrap">
                                      {invoice.originalText.substring(0, 500)}
                                      {invoice.originalText.length > 500 && '...'}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Notes */}
                              {invoice.notes && (
                                <div className="md:col-span-2 space-y-4">
                                  <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
                                    Notes
                                  </h3>
                                  <div className="bg-slate-800 rounded-lg p-4">
                                    <p className="text-slate-300">{invoice.notes}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end space-x-3 border-t border-slate-700 pt-4">
                              {invoice.status === 'pending' && (
                                <>
                                  <Button
                                    variant="outline"
                                    onClick={() => updateInvoiceStatusMutation.mutate({ 
                                      id: invoice.id, 
                                      status: 'cancelled'
                                    })}
                                    disabled={updateInvoiceStatusMutation.isPending}
                                    className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    onClick={() => { setReviewInvoice({ ...invoice, locationId: invoice.locationId || invoice.location_id || currentLocation?.id, vendor: invoice.vendor?.name || '', total: invoice.totalAmount || invoice.total || 0, subtotal: invoice.subtotal || 0, lineItems: invoice.lineItems || [], fees: invoice.fees || [] }); setIsReviewOpen(true); }}
                                    disabled={updateInvoiceStatusMutation.isPending}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                  </Button>
                                </>
                              )}
                              {invoice.status === 'approved' && (
                                <Button
                                  onClick={() => updateInvoiceStatusMutation.mutate({ 
                                    id: invoice.id, 
                                    status: 'paid' 
                                  })}
                                  disabled={updateInvoiceStatusMutation.isPending}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  Mark as Paid
                                </Button>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        {invoice.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setReviewInvoice({ ...invoice, locationId: invoice.locationId || invoice.location_id || currentLocation?.id, vendor: invoice.vendor?.name || '', total: invoice.totalAmount || invoice.total || 0, subtotal: invoice.subtotal || 0, lineItems: invoice.lineItems || [], fees: invoice.fees || [] }); setIsReviewOpen(true); }}
                            disabled={updateInvoiceStatusMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteInvoiceMutation.mutate(invoice.id)}
                          disabled={deleteInvoiceMutation.isPending}
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice Review Dialog */}
      <InvoiceReviewDialog
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        invoiceData={reviewInvoice}
      />
    </div>
  );
}