import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Edit3, Check, X, FileText, ExternalLink } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LineItem {
  description: string;
  quantity: number;
  unitType: string; // e.g., "lbs", "cases", "each", "gallons"
  unitPrice: number;
  totalPrice: number;
  inventoryItemId?: string;
}

interface Fee {
  description: string;
  amount: number;
}

interface InvoiceReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: {
    id: string;
    vendor: string;
    invoiceNumber: string;
    invoiceDate: string;
    total: number;
    subtotal: number;
    lineItems: LineItem[];
    fees: Fee[];
    ocrConfidence: number;
    attachmentPath?: string;
    locationId?: string;
    inventoryReceivedAt?: string | null;
  } | null;
}

export function InvoiceReviewDialog({ isOpen, onClose, invoiceData }: InvoiceReviewDialogProps) {
  const [editableData, setEditableData] = useState<any>(null);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const inventory = useQuery<Array<{ id: string; name: string; unit: string }>>({
    queryKey: ['/api/inventory', { locationId: invoiceData?.locationId }],
    queryFn: () => apiRequest('GET', `/api/inventory?locationId=${invoiceData?.locationId}`).then(response => response.json()),
    enabled: isOpen && !!invoiceData?.locationId,
  });
  // Initialize editable data when dialog opens
  React.useEffect(() => {
    if (invoiceData && isOpen) {
      setEditableData({
        vendor: invoiceData.vendor,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        total: invoiceData.total,
        subtotal: invoiceData.subtotal,
        lineItems: [...invoiceData.lineItems],
        receiveInventory: true,
        fees: [...(invoiceData.fees || [])]
      });
    }
  }, [invoiceData, isOpen]);

  const approveInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('PUT', `/api/invoices/${invoiceData?.id}/approve`, data);
    },
    onSuccess: () => {
      // Invalidate all invoice queries regardless of status filter
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
      toast({
        title: "Success",
        description: editableData.receiveInventory === false ? "Invoice approved; stock was already received" : "Invoice approved and inventory received",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve invoice",
        variant: "destructive",
      });
    },
  });

  const rejectInvoiceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/invoices/${invoiceData?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({
        title: "Success",
        description: "Invoice rejected and deleted",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to reject invoice",
        variant: "destructive",
      });
    },
  });

  const handleLineItemEdit = (index: number, field: string, value: any) => {
    if (!editableData) return;
    
    const newLineItems = [...editableData.lineItems];
    newLineItems[index] = {
      ...newLineItems[index],
      [field]: field === 'quantity' || field === 'unitPrice' ? parseFloat(value) || 0 : value
    };
    
    // Recalculate total price for the line item
    if (field === 'quantity' || field === 'unitPrice') {
      newLineItems[index].totalPrice = newLineItems[index].quantity * newLineItems[index].unitPrice;
    }
    
    setEditableData({
      ...editableData,
      lineItems: newLineItems
    });
  };

  const addLineItem = () => {
    if (!editableData) return;
    
    setEditableData({
      ...editableData,
      lineItems: [...editableData.lineItems, {
        description: "New Item",
        quantity: 1,
        unitType: "each",
        unitPrice: 0,
        totalPrice: 0
      }]
    });
  };

  const removeLineItem = (index: number) => {
    if (!editableData) return;
    
    const newLineItems = editableData.lineItems.filter((_: any, i: number) => i !== index);
    setEditableData({
      ...editableData,
      lineItems: newLineItems
    });
  };

  const handleFeeEdit = (index: number, field: string, value: any) => {
    if (!editableData) return;
    
    const newFees = [...editableData.fees];
    newFees[index] = {
      ...newFees[index],
      [field]: field === 'amount' ? parseFloat(value) || 0 : value
    };
    
    setEditableData({
      ...editableData,
      fees: newFees
    });
  };

  const addFee = () => {
    if (!editableData) return;
    
    setEditableData({
      ...editableData,
      fees: [...editableData.fees, {
        description: "Delivery Charge",
        amount: 0
      }]
    });
  };

  const removeFee = (index: number) => {
    if (!editableData) return;
    
    const newFees = editableData.fees.filter((_: any, i: number) => i !== index);
    setEditableData({
      ...editableData,
      fees: newFees
    });
  };

  const calculateSubtotal = () => {
    if (!editableData) return 0;
    return editableData.lineItems.reduce((sum: number, item: LineItem) => sum + item.totalPrice, 0);
  };

  const calculateFeesTotal = () => {
    if (!editableData) return 0;
    return editableData.fees.reduce((sum: number, fee: Fee) => sum + fee.amount, 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateFeesTotal();
  };

  const handleApprove = () => {
    if (!editableData) return;
    
    const finalData = {
      ...editableData,
      subtotal: calculateSubtotal(),
      total: calculateTotal(),
      lineItems: editableData.lineItems, // Ensure line items are explicitly included
      fees: editableData.fees // Store fees as array (backend will JSON.stringify)
    };
    
    approveInvoiceMutation.mutate(finalData);
  };

  if (!invoiceData || !editableData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Review & Edit Invoice
            <Badge variant="secondary" className="ml-2">
              {invoiceData.ocrConfidence}% OCR Confidence
            </Badge>
            {invoiceData.attachmentPath && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => window.open(`/api/invoices/${invoiceData.id}/attachment`, '_blank')}
              >
                <FileText className="h-4 w-4 mr-1" />
                View Original
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {invoiceData.inventoryReceivedAt && <p className="text-sm text-muted-foreground">Inventory was already received. Use an inventory adjustment to correct stock.</p>}
        {!invoiceData.inventoryReceivedAt && <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editableData.receiveInventory === false} disabled={approveInvoiceMutation.isPending} onChange={event => setEditableData({ ...editableData, receiveInventory: !event.target.checked })} />
          Stock already received, for example through a purchase order. Approve without adding stock again.
        </label>}
        <fieldset disabled={!!invoiceData.inventoryReceivedAt || approveInvoiceMutation.isPending} className="space-y-6">
          {/* Invoice Header Information */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vendor">Vendor</Label>
                  <Input
                    id="vendor"
                    value={editableData.vendor}
                    onChange={(e) => setEditableData({...editableData, vendor: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    value={editableData.invoiceNumber}
                    onChange={(e) => setEditableData({...editableData, invoiceNumber: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={editableData.invoiceDate}
                    onChange={(e) => setEditableData({...editableData, invoiceDate: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Subtotal (Line Items)</Label>
                  <div className="text-lg font-semibold mt-1">
                    ${calculateSubtotal().toFixed(2)}
                  </div>
                </div>
                <div>
                  <Label>Fees Total</Label>
                  <div className="text-lg font-semibold mt-1">
                    ${calculateFeesTotal().toFixed(2)}
                  </div>
                </div>
                <div>
                  <Label>Invoice Total</Label>
                  <div className="text-2xl font-bold text-green-600 mt-1">
                    ${calculateTotal().toFixed(2)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Line Items ({editableData.lineItems.length})</CardTitle>
              <Button onClick={addLineItem} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {editableData.lineItems.map((item: LineItem, index: number) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Item #{index + 1}</span>
                      <Button
                        onClick={() => removeLineItem(index)}
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-5 gap-3">
                      <div className="col-span-2">
                        <Label>Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => handleLineItemEdit(index, 'description', e.target.value)}
                          placeholder="Product description"
                        />
                      </div>
                      <div>
                        <Label>Inventory Item</Label>
                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={item.inventoryItemId || ''} onChange={e => handleLineItemEdit(index, 'inventoryItemId', e.target.value || undefined)}>
                          <option value="">Match by name or create new</option>
                          {(inventory.data ?? []).map(stock => <option key={stock.id} value={stock.id}>{stock.name} ({stock.unit})</option>)}
                        </select>
                        {inventory.isError && <p className="text-sm text-red-400">Could not load inventory choices. <button type="button" onClick={() => inventory.refetch()}>Retry</button></p>}
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => handleLineItemEdit(index, 'quantity', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Unit Type</Label>
                        <select
                          value={item.unitType || 'each'}
                          onChange={(e) => handleLineItemEdit(index, 'unitType', e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="each">Each</option>
                          <option value="lbs">Lbs</option>
                          <option value="cases">Cases</option>
                          <option value="gallons">Gallons</option>
                          <option value="oz">Oz</option>
                          <option value="kg">Kg</option>
                          <option value="liters">Liters</option>
                          <option value="boxes">Boxes</option>
                          <option value="bags">Bags</option>
                          <option value="bottles">Bottles</option>
                          <option value="cans">Cans</option>
                          <option value="packs">Packs</option>
                        </select>
                      </div>
                      <div>
                        <Label>Unit Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemEdit(index, 'unitPrice', e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Line Total:</span>
                      <span className="font-semibold">${item.totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                
                {editableData.lineItems.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No line items found. Click "Add Item" to add products manually.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fees Section - IRS Compliant Separate Tracking */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Fees & Charges ({editableData.fees.length})
                <Badge variant="outline" className="text-xs">IRS Compliant</Badge>
              </CardTitle>
              <Button onClick={addFee} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Add Fee
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {editableData.fees.map((fee: Fee, index: number) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3 bg-orange-50 dark:bg-orange-950/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                        Fee #{index + 1}
                      </span>
                      <Button
                        onClick={() => removeFee(index)}
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Description</Label>
                        <Input
                          value={fee.description}
                          onChange={(e) => handleFeeEdit(index, 'description', e.target.value)}
                          placeholder="Delivery, shipping, etc."
                        />
                      </div>
                      <div>
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={fee.amount}
                          onChange={(e) => handleFeeEdit(index, 'amount', e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t border-orange-200 dark:border-orange-800">
                      <span className="text-sm text-orange-600 dark:text-orange-400">Fee Amount:</span>
                      <span className="font-semibold text-orange-700 dark:text-orange-300">${fee.amount.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
                
                {editableData.fees.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No fees detected. Click "Add Fee" to add delivery charges, shipping costs, etc.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              onClick={() => rejectInvoiceMutation.mutate()}
              variant="destructive"
              disabled={rejectInvoiceMutation.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              {rejectInvoiceMutation.isPending ? "Rejecting..." : "Reject Invoice"}
            </Button>
            
            <div className="space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveInvoiceMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-2" />
                {approveInvoiceMutation.isPending ? "Approving..." : (editableData.receiveInventory === false ? "Approve Already Received" : "Approve & Receive")}
              </Button>
            </div>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}