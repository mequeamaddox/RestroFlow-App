import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Plus, 
  Search, 
  FileText, 
  Calendar, 
  DollarSign, 
  Building2, 
  Eye, 
  Edit, 
  Trash2, 
  MoreVertical,
  Package,
  ShoppingCart,
  AlertTriangle,
  CheckCircle,
  Clock,
  X
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPurchaseOrderSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useLocation } from "@/contexts/LocationContext";

// Create a form-specific schema for purchase orders with line items
const purchaseOrderFormSchema = z.object({
  vendorId: z.string().min(1, "Vendor is required"),
  status: z.enum(["draft", "sent", "confirmed", "delivered", "cancelled"]).default("draft"),
  orderDate: z.string().min(1, "Order date is required"),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseOrderFormData = z.infer<typeof purchaseOrderFormSchema>;

interface LineItem {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  unit: string;
}

export default function PurchaseOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [itemQuantity, setItemQuantity] = useState("");
  const [itemUnitCost, setItemUnitCost] = useState("");

  // Real-time cost calculation
  const getCurrentItemTotal = () => {
    const qty = parseFloat(itemQuantity) || 0;
    const cost = parseFloat(itemUnitCost) || 0;
    return qty * cost;
  };

  const getSelectedItemInfo = () => {
    return inventoryItems.find((item: any) => item.id === selectedInventoryItem);
  };
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentLocation } = useLocation();

  const { data: purchaseOrders = [], isLoading } = useQuery({
    queryKey: ['/api/purchase-orders', currentLocation?.id],
    queryFn: async () => {
      const params = currentLocation?.id ? `?locationId=${currentLocation.id}` : '';
      const response = await fetch(`/api/purchase-orders${params}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['/api/vendors', currentLocation?.id],
    queryFn: async () => {
      const params = currentLocation?.id ? `?locationId=${currentLocation.id}` : '';
      const response = await fetch(`/api/vendors${params}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['/api/inventory', currentLocation?.id],
    queryFn: async () => {
      const params = currentLocation?.id ? `?locationId=${currentLocation.id}` : '';
      const response = await fetch(`/api/inventory${params}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['/api/inventory/low-stock', currentLocation?.id],
    queryFn: async () => {
      const params = currentLocation?.id ? `?locationId=${currentLocation.id}` : '';
      const response = await fetch(`/api/inventory/low-stock${params}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentLocation,
  });

  const form = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: {
      vendorId: "",
      orderDate: new Date().toISOString().split('T')[0],
      expectedDeliveryDate: "",
      status: "draft",
      notes: "",
    },
  });

  // Helper functions for line item management
  const addLineItem = () => {
    if (!selectedInventoryItem || !itemQuantity || !itemUnitCost) {
      toast({
        title: "Missing Information",
        description: "Please select an item and enter quantity and unit cost",
        variant: "destructive"
      });
      return;
    }

    const inventoryItem = inventoryItems.find((item: any) => item.id === selectedInventoryItem);
    if (!inventoryItem) return;

    const quantity = parseFloat(itemQuantity);
    const unitCost = parseFloat(itemUnitCost);
    const totalCost = quantity * unitCost;

    const newItem: LineItem = {
      inventoryItemId: selectedInventoryItem,
      inventoryItemName: inventoryItem.name,
      quantity,
      unitCost,
      totalCost,
      unit: inventoryItem.unit || 'units'
    };

    setLineItems(prev => [...prev, newItem]);
    setSelectedInventoryItem("");
    setItemQuantity("");
    setItemUnitCost("");
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const getTotalAmount = () => {
    return lineItems.reduce((sum, item) => sum + item.totalCost, 0);
  };

  const clearForm = () => {
    form.reset();
    setLineItems([]);
    setSelectedInventoryItem("");
    setItemQuantity("");
    setItemUnitCost("");
  };

  const createPOMutation = useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      if (lineItems.length === 0) {
        throw new Error("Please add at least one line item to the purchase order");
      }

      const poData = {
        vendorId: data.vendorId,
        locationId: currentLocation?.id,
        status: data.status,
        orderDate: data.orderDate,
        expectedDeliveryDate: data.expectedDeliveryDate || null,
        totalAmount: getTotalAmount().toString(),
        notes: data.notes || null,
      };
      
      // Create purchase order first
      const orderResponse = await apiRequest('POST', '/api/purchase-orders', poData);
      const order = await orderResponse.json();
      
      // Add line items
      for (const item of lineItems) {
        await apiRequest('POST', `/api/purchase-orders/${order.id}/items`, {
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity.toString(),
          unitCost: item.unitCost.toString(),
          totalCost: item.totalCost.toString()
        });
      }
      
      return order;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      setIsCreateDialogOpen(false);
      clearForm();
      toast({
        title: "Success",
        description: `Purchase order ${order.orderNumber} created with ${lineItems.length} items`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase order",
        variant: "destructive",
      });
    },
  });

  const updatePOMutation = useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      if (!selectedOrder?.id) throw new Error('No order selected');
      const poData = {
        vendorId: data.vendorId,
        status: data.status,
        orderDate: data.orderDate,
        expectedDeliveryDate: data.expectedDeliveryDate || null,
        totalAmount: getTotalAmount().toString(),
        notes: data.notes || null,
      };
      await apiRequest('PUT', `/api/purchase-orders/${selectedOrder.id}`, poData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      setIsEditDialogOpen(false);
      setSelectedOrder(null);
      form.reset();
      toast({
        title: "Success",
        description: "Purchase order updated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update purchase order",
        variant: "destructive",
      });
    },
  });

  const filteredOrders = purchaseOrders?.filter((order: any) => {
    const matchesSearch = order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const onSubmit = (data: PurchaseOrderFormData) => {
    if (isEditDialogOpen && selectedOrder) {
      updatePOMutation.mutate(data);
    } else {
      createPOMutation.mutate(data);
    }
  };

  const handleViewDetails = (order: any) => {
    setSelectedOrder(order);
    setIsDetailsDialogOpen(true);
  };

  const handleEditOrder = (order: any) => {
    setSelectedOrder(order);
    // Pre-populate form with existing order data
    form.reset({
      vendorId: order.vendorId,
      status: order.status,
      orderDate: order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : "",
      expectedDeliveryDate: order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toISOString().split('T')[0] : "",
      // totalAmount is calculated, not editable in form
      notes: order.notes || "",
    });
    setIsDetailsDialogOpen(false);
    setIsEditDialogOpen(true);
  };

  // Mutation for creating PO from low stock items
  const createFromLowStockMutation = useMutation({
    mutationFn: async (data: { vendorId: string; lowStockItems: any[] }) => {
      const response = await apiRequest('POST', '/api/purchase-orders/from-low-stock', {
        vendorId: data.vendorId,
        locationId: currentLocation?.id,
        lowStockItems: data.lowStockItems
      });
      return response.json();
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/low-stock'] });
      toast({
        title: "Success",
        description: `Purchase order ${order.orderNumber} created from ${order.items?.length || 0} low stock items`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase order from low stock",
        variant: "destructive",
      });
    },
  });

  const handleDeleteOrder = (order: any) => {
    if (confirm(`Are you sure you want to delete purchase order ${order.orderNumber}?`)) {
      deleteOrderMutation.mutate(order.id);
    }
  };

  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/purchase-orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      toast({
        title: "Success",
        description: "Purchase order deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete purchase order",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-accent text-foreground';
      case 'sent': return 'bg-blue-900/30 text-blue-400 border border-blue-800';
      case 'confirmed': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      case 'delivered': return 'bg-green-900/30 text-green-400 border border-green-800';
      case 'cancelled': return 'bg-red-900/30 text-red-400 border border-red-800';
      default: return 'bg-accent text-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage supplier orders and deliveries</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary-600 hover:bg-primary-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vendorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select vendor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vendors.map((vendor: any) => (
                              <SelectItem key={vendor.id} value={vendor.id}>
                                {vendor.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="orderDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order Date *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expectedDeliveryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Delivery</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Line Items Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Line Items</h3>
                    <Badge variant="secondary">
                      {lineItems.length} item{lineItems.length !== 1 ? 's' : ''} - Total: ${getTotalAmount().toFixed(2)}
                    </Badge>
                  </div>
                  
                  {/* Add Line Item Form with Real-time Calculations */}
                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-600 shadow-sm">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      {/* Item Selection */}
                      <div className="col-span-5">
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Inventory Item
                        </label>
                        <Select value={selectedInventoryItem} onValueChange={setSelectedInventoryItem}>
                          <SelectTrigger className="h-10 bg-card text-foreground">
                            <SelectValue placeholder="Select item..." />
                          </SelectTrigger>
                          <SelectContent>
                            {inventoryItems.map((item: any) => (
                              <SelectItem key={item.id} value={item.id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{item.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    Current: {item.currentStock} {item.unit}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {getSelectedItemInfo() && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-1">
                            <p>Last cost: ${getSelectedItemInfo()?.unitCost?.toFixed(2) || '0.00'}</p>
                            {parseFloat(itemUnitCost) > 0 && getSelectedItemInfo()?.unitCost && (
                              <div className="flex items-center space-x-2">
                                <span>Price change:</span>
                                {parseFloat(itemUnitCost) > getSelectedItemInfo()?.unitCost ? (
                                  <span className="text-red-600 font-medium">
                                    +${(parseFloat(itemUnitCost) - getSelectedItemInfo()?.unitCost).toFixed(2)} 
                                    (+{(((parseFloat(itemUnitCost) - getSelectedItemInfo()?.unitCost) / getSelectedItemInfo()?.unitCost) * 100).toFixed(1)}%)
                                  </span>
                                ) : parseFloat(itemUnitCost) < getSelectedItemInfo()?.unitCost ? (
                                  <span className="text-green-600 font-medium">
                                    -${(getSelectedItemInfo()?.unitCost - parseFloat(itemUnitCost)).toFixed(2)} 
                                    (-{(((getSelectedItemInfo()?.unitCost - parseFloat(itemUnitCost)) / getSelectedItemInfo()?.unitCost) * 100).toFixed(1)}%)
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">No change</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Quantity {getSelectedItemInfo()?.unit && `(${getSelectedItemInfo()?.unit})`}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={itemQuantity}
                          onChange={(e) => setItemQuantity(e.target.value)}
                          className="h-10 text-center bg-card text-foreground"
                          data-testid="input-quantity"
                        />
                        {getSelectedItemInfo()?.unit && (
                          <p className="text-xs text-muted-foreground mt-1 text-center">
                            {getSelectedItemInfo()?.unit}
                          </p>
                        )}
                      </div>

                      {/* Unit Cost */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Unit Cost
                        </label>
                        <div className="relative">
                          <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={itemUnitCost}
                            onChange={(e) => setItemUnitCost(e.target.value)}
                            className="h-10 pl-8 text-center bg-card text-foreground"
                            data-testid="input-unit-cost"
                          />
                        </div>
                      </div>

                      {/* Live Total */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Line Total
                        </label>
                        <div className="h-10 px-3 py-2 bg-green-900/20 border border-green-700/50 rounded-md flex items-center justify-center">
                          <span className="text-sm font-bold text-green-400">
                            ${getCurrentItemTotal().toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Add Button */}
                      <div className="col-span-1">
                        <Button 
                          type="button" 
                          onClick={addLineItem} 
                          className="w-full h-10 bg-primary-600 hover:bg-primary-700"
                          disabled={!selectedInventoryItem || !itemQuantity || !itemUnitCost}
                          data-testid="button-add-line-item"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Quick Fill Suggestions */}
                    {getSelectedItemInfo() && (
                      <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">Quick fill:</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setItemUnitCost(getSelectedItemInfo()?.unitCost?.toString() || "")}
                          className="h-6 px-2 text-xs"
                        >
                          Last Cost (${getSelectedItemInfo()?.unitCost?.toFixed(2)})
                        </Button>
                        {getSelectedItemInfo()?.reorderLevel && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setItemQuantity((getSelectedItemInfo()?.reorderLevel * 2).toString())}
                            className="h-6 px-2 text-xs"
                          >
                            Suggested Qty ({getSelectedItemInfo()?.reorderLevel * 2})
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Line Items Table with Enhanced Cost Display */}
                  {lineItems.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-800">
                          <TableRow>
                            <TableHead className="font-semibold">Item</TableHead>
                            <TableHead className="text-center">Quantity</TableHead>
                            <TableHead className="text-center">Unit Cost</TableHead>
                            <TableHead className="text-center">Line Total</TableHead>
                            <TableHead className="text-center">% of Total</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineItems.map((item, index) => {
                            const percentOfTotal = getTotalAmount() > 0 ? (item.totalCost / getTotalAmount()) * 100 : 0;
                            return (
                              <TableRow key={index} className="hover:bg-accent">
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{item.inventoryItemName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      Line #{index + 1}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{item.quantity}</span>
                                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex flex-col">
                                    <span className="font-medium">${item.unitCost.toFixed(2)}</span>
                                    <span className="text-xs text-muted-foreground">per {item.unit}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-green-700">${item.totalCost.toFixed(2)}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.quantity} {item.unit} × ${item.unitCost.toFixed(2)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{percentOfTotal.toFixed(1)}%</span>
                                    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                                      <div 
                                        className="bg-blue-500 h-1.5 rounded-full" 
                                        style={{ width: `${Math.min(percentOfTotal, 100)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeLineItem(index)}
                                    data-testid={`button-remove-item-${index}`}
                                    className="hover:bg-red-900/20 hover:text-red-400"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      
                      {/* Order Summary Footer */}
                      <div className="bg-muted border-t px-6 py-4">
                        <div className="grid grid-cols-3 gap-6">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{lineItems.length}</div>
                            <div className="text-sm text-muted-foreground">Total Items</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">
                              {lineItems.reduce((sum, item) => sum + item.quantity, 0)}
                            </div>
                            <div className="text-sm text-muted-foreground">Total Quantity</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              ${getTotalAmount().toFixed(2)}
                            </div>
                            <div className="text-sm text-muted-foreground">Order Total</div>
                          </div>
                        </div>
                        
                        {/* Cost Breakdown & Insights */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Average cost per item:</span>
                              <span className="font-medium">
                                ${lineItems.length > 0 ? (getTotalAmount() / lineItems.length).toFixed(2) : '0.00'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Average cost per unit:</span>
                              <span className="font-medium">
                                ${lineItems.reduce((sum, item) => sum + item.quantity, 0) > 0 
                                  ? (getTotalAmount() / lineItems.reduce((sum, item) => sum + item.quantity, 0)).toFixed(2) 
                                  : '0.00'}
                              </span>
                            </div>
                          </div>
                          
                          {/* Cost Insights */}
                          {lineItems.length > 0 && (
                            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
                              <div className="flex items-center space-x-2 mb-2">
                                <DollarSign className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium text-blue-300">Cost Insights</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                {(() => {
                                  const mostExpensive = lineItems.reduce((max, item) => item.totalCost > max.totalCost ? item : max, lineItems[0]);
                                  const cheapest = lineItems.reduce((min, item) => item.totalCost < min.totalCost ? item : min, lineItems[0]);
                                  const priceChanges = lineItems.filter(item => {
                                    const inventoryItem = inventoryItems.find((inv: any) => inv.id === item.inventoryItemId);
                                    return inventoryItem?.unitCost && Math.abs(inventoryItem.unitCost - item.unitCost) > 0.01;
                                  });
                                  
                                  return (
                                    <>
                                      <div>
                                        <span className="text-blue-700 font-medium">Highest cost item:</span>
                                        <div className="text-blue-600">{mostExpensive.inventoryItemName} (${mostExpensive.totalCost.toFixed(2)})</div>
                                      </div>
                                      <div>
                                        <span className="text-blue-700 font-medium">Lowest cost item:</span>
                                        <div className="text-blue-600">{cheapest.inventoryItemName} (${cheapest.totalCost.toFixed(2)})</div>
                                      </div>
                                      {priceChanges.length > 0 && (
                                        <div className="col-span-2 pt-2 border-t border-blue-200">
                                          <span className="text-blue-700 font-medium">Price changes detected:</span>
                                          <div className="text-blue-600">
                                            {priceChanges.length} item{priceChanges.length !== 1 ? 's' : ''} with different pricing
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {lineItems.length === 0 && (
                    <div className="text-center py-6 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No items added yet. Add items above to create your purchase order.</p>
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Additional notes or special instructions..."
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createPOMutation.isPending || updatePOMutation.isPending}
                    className="bg-primary-600 hover:bg-primary-700"
                  >
                    {isEditDialogOpen 
                      ? (updatePOMutation.isPending ? "Updating..." : "Update Purchase Order")
                      : (createPOMutation.isPending ? "Creating..." : "Create Purchase Order")
                    }
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Purchase Order Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Purchase Order</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vendorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {vendors?.map((vendor: any) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="orderDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expectedDeliveryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {/* Total Amount is calculated automatically, not editable */}
              <div className="bg-muted p-4 rounded-lg">
                <label className="text-sm font-medium text-foreground">Total Amount</label>
                <p className="text-2xl font-semibold text-green-600 mt-1">
                  ${selectedOrder?.totalAmount ? parseFloat(selectedOrder.totalAmount).toFixed(2) : '0.00'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Calculated from line items</p>
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional notes..."
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setSelectedOrder(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updatePOMutation.isPending}
                  className="bg-primary-600 hover:bg-primary-700"
                >
                  {updatePOMutation.isPending ? "Updating..." : "Update Purchase Order"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by order number or vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Low Stock Items Quick Actions */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-800/50 bg-orange-900/20">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              <CardTitle className="text-orange-300">Low Stock Items ({lowStockItems.length})</CardTitle>
            </div>
            <p className="text-sm text-orange-400">
              These items are running low and may need reordering
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {lowStockItems.slice(0, 6).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Current: {item.currentStock} | Reorder at: {item.reorderLevel}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Package className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-600">
                      {Math.max(0, item.reorderLevel - item.currentStock)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {lowStockItems.length > 6 && (
              <p className="text-sm text-orange-600 mt-3">
                +{lowStockItems.length - 6} more items need attention
              </p>
            )}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-orange-200">
              <span className="text-sm text-orange-700">Quick Actions:</span>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Group by vendor and create POs automatically
                    const vendors = Array.from(new Set(lowStockItems.map((item: any) => item.vendorId).filter(Boolean))) as string[];
                    if (vendors.length === 0) {
                      toast({
                        title: "No Vendors",
                        description: "Please assign vendors to inventory items first",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    vendors.forEach((vendorId: string) => {
                      const vendorItems = lowStockItems.filter((item: any) => item.vendorId === vendorId);
                      createFromLowStockMutation.mutate({
                        vendorId,
                        lowStockItems: vendorItems
                      });
                    });
                  }}
                  className="text-orange-400 border-orange-700 hover:bg-orange-900/20"
                  data-testid="button-create-pos-from-low-stock"
                >
                  <ShoppingCart className="h-4 w-4 mr-1" />
                  Create POs
                </Button>
                <Button
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/inventory'}
                  className="text-orange-400 border-orange-700 hover:bg-orange-900/20"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchase Orders Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOrders?.map((order: any) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-primary-600" />
                    <CardTitle className="text-lg">{order.orderNumber}</CardTitle>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(order.status!)}>
                      {getStatusLabel(order.status!)}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetails(order)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditOrder(order)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Order
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteOrder(order)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Order
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {order.vendor && (
                  <div className="flex items-center space-x-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-muted-foreground">{order.vendor.name}</p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Order Date</span>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">
                        {order.orderDate ? format(new Date(order.orderDate), 'MMM d, yyyy') : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Amount</span>
                    <div className="flex items-center space-x-1">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="font-medium">
                        ${parseFloat(order.totalAmount || '0').toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {order.expectedDeliveryDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Expected Delivery</span>
                      <span className="text-sm">
                        {format(new Date(order.expectedDeliveryDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleViewDetails(order)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleEditOrder(order)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && (!filteredOrders || filteredOrders.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No purchase orders found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || statusFilter ? "No orders match your search criteria." : "Start by creating your first purchase order."}
            </p>
            <Button className="bg-primary-600 hover:bg-primary-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Purchase Order
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Order Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Purchase Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Header */}
              <div className="flex items-center justify-between pb-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">{selectedOrder.orderNumber}</h3>
                  <p className="text-sm text-muted-foreground">
                    Created {selectedOrder.createdAt ? format(new Date(selectedOrder.createdAt), 'PPP') : 'N/A'}
                  </p>
                </div>
                <Badge className={getStatusColor(selectedOrder.status!)}>
                  {getStatusLabel(selectedOrder.status!)}
                </Badge>
              </div>

              {/* Order Information */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Vendor</label>
                    <p className="mt-1 text-sm">{selectedOrder.vendor?.name || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Order Date</label>
                    <p className="mt-1 text-sm">
                      {selectedOrder.orderDate ? format(new Date(selectedOrder.orderDate), 'PPP') : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Expected Delivery</label>
                    <p className="mt-1 text-sm">
                      {selectedOrder.expectedDeliveryDate 
                        ? format(new Date(selectedOrder.expectedDeliveryDate), 'PPP') 
                        : 'Not specified'}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Total Amount</label>
                    <p className="mt-1 text-lg font-semibold text-green-600">
                      ${parseFloat(selectedOrder.totalAmount || '0').toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Created By</label>
                    <p className="mt-1 text-sm">{selectedOrder.createdBy || 'System'}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notes</label>
                  <p className="mt-1 text-sm bg-muted p-3 rounded-md">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
                  Close
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleEditOrder(selectedOrder)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Order
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => handleDeleteOrder(selectedOrder)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
