import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Package, AlertTriangle, CheckCircle, Wine } from "lucide-react";
import { BarUpgradePrompt } from "@/components/bar/bar-upgrade-prompt";
import { useLocation } from "@/contexts/LocationContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type FilterTab = "all" | "below-par" | "critical";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  costPerUnit: number;
  isAlcoholic?: boolean;
  locationId: string;
}

interface Vendor {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

function getItemStatus(quantity: number, reorderLevel: number): "ok" | "low" | "critical" {
  if (quantity >= reorderLevel) return "ok";
  if (quantity >= reorderLevel / 2) return "low";
  return "critical";
}

function getSuggestedOrderQty(quantity: number, reorderLevel: number): number {
  const base = Math.max(0, reorderLevel - quantity);
  return Math.ceil(base * 1.2);
}

function isBarItem(item: InventoryItem): boolean {
  if (item.isAlcoholic === true) return true;
  const barCategories = ["alcohol", "beer", "wine", "spirits", "liquor", "cocktail", "bar", "beverage"];
  return barCategories.some(cat => item.category?.toLowerCase().includes(cat));
}

export default function BarPurchaseOrders() {
  const { currentLocation, hasBarAccess } = useLocation();
  const { toast } = useToast();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showPODialog, setShowPODialog] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [poNotes, setPoNotes] = useState("");

  const locationId = currentLocation?.id;

  const { data: inventoryItems = [], isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", locationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory?locationId=${locationId}`);
      return res.json();
    },
    enabled: !!locationId && hasBarAccess,
  });

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors", locationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors?locationId=${locationId}`);
      return res.json();
    },
    enabled: !!locationId && hasBarAccess,
  });

  const createPOMutation = useMutation({
    mutationFn: async (payload: {
      vendorId: string;
      locationId: string;
      totalAmount: number;
      notes: string;
      status: string;
    }) => {
      const res = await apiRequest("POST", "/api/purchase-orders", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Draft PO Created",
        description: (
          <span>
            Purchase order created.{" "}
            <Link href="/purchase-orders" className="underline font-medium">
              View Purchase Orders
            </Link>
          </span>
        ) as any,
      });
      setShowPODialog(false);
      setSelectedItems(new Set());
      setSelectedVendorId("");
      setPoNotes("");
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create PO",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Guard after all hooks
  if (!hasBarAccess) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <BarUpgradePrompt locationName={currentLocation?.name ?? "this location"} />
      </div>
    );
  }

  const barItems = inventoryItems.filter(isBarItem);

  const filteredItems = barItems.filter((item) => {
    const status = getItemStatus(item.quantity, item.reorderLevel);
    if (filterTab === "below-par") return status === "low" || status === "critical";
    if (filterTab === "critical") return status === "critical";
    return true;
  });

  const checkedItems = barItems.filter((item) => selectedItems.has(item.id));

  const totalEstCost = checkedItems.reduce((sum, item) => {
    const suggestedQty = getSuggestedOrderQty(item.quantity, item.reorderLevel);
    return sum + suggestedQty * (item.costPerUnit ?? 0);
  }, 0);

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedItems.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleGeneratePO = () => {
    if (selectedItems.size === 0) return;
    setShowPODialog(true);
  };

  const handleConfirmPO = () => {
    if (!selectedVendorId || !locationId) return;
    createPOMutation.mutate({
      vendorId: selectedVendorId,
      locationId,
      totalAmount: totalEstCost,
      notes: poNotes,
      status: "draft",
    });
  };

  const statusBadge = (item: InventoryItem) => {
    const status = getItemStatus(item.quantity, item.reorderLevel);
    if (status === "ok") {
      return (
        <Badge className="bg-green-900/30 text-green-400 border border-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          OK
        </Badge>
      );
    }
    if (status === "low") {
      return (
        <Badge className="bg-yellow-900/30 text-yellow-400 border border-yellow-800">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Low
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-900/30 text-red-400 border border-red-800">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Critical
      </Badge>
    );
  };

  const isLoading = inventoryLoading || vendorsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Wine className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading bar inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            Bar Purchase Orders
          </h1>
          <p className="text-muted-foreground">Restock bar inventory below par</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="bg-red-900/30 text-red-400 border border-red-800">
            {barItems.filter((i) => getItemStatus(i.quantity, i.reorderLevel) === "critical").length} Critical
          </Badge>
          <Badge variant="secondary" className="bg-yellow-900/30 text-yellow-400 border border-yellow-800">
            {barItems.filter((i) => getItemStatus(i.quantity, i.reorderLevel) === "low").length} Low
          </Badge>
        </div>
      </div>

      {/* Empty state */}
      {barItems.length === 0 ? (
        <Card className="p-12 text-center">
          <Wine className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No bar inventory items</h3>
          <p className="text-muted-foreground mb-4">
            Add bar inventory items first to create purchase orders.
          </p>
          <Button asChild variant="outline">
            <Link href="/inventory">Go to Inventory</Link>
          </Button>
        </Card>
      ) : (
        <>
          {/* Filter Tabs */}
          <div className="flex gap-2 border-b border-border">
            {(["all", "below-par", "critical"] as FilterTab[]).map((tab) => {
              const labels: Record<FilterTab, string> = {
                all: "All",
                "below-par": "Below Par",
                critical: "Critical",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    filterTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-filter-${tab}`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Items Table */}
          {filteredItems.length === 0 ? (
            <Card className="p-10 text-center">
              <Package className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-muted-foreground">No items match this filter.</p>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="p-3 text-left w-10">
                        <Checkbox
                          checked={
                            filteredItems.length > 0 &&
                            filteredItems.every((i) => selectedItems.has(i.id))
                          }
                          onCheckedChange={toggleAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Item Name</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Current Qty</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Par Level</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Suggested Order</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const suggestedQty = getSuggestedOrderQty(item.quantity, item.reorderLevel);
                      const estCost = suggestedQty * (item.costPerUnit ?? 0);
                      const checked = selectedItems.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-border last:border-0 transition-colors ${
                            checked ? "bg-primary/5" : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="p-3">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleItem(item.id)}
                              data-testid={`checkbox-item-${item.id}`}
                            />
                          </td>
                          <td className="p-3 font-medium">{item.name}</td>
                          <td className="p-3 text-muted-foreground">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {item.reorderLevel} {item.unit}
                          </td>
                          <td className="p-3">{statusBadge(item)}</td>
                          <td className="p-3">
                            {suggestedQty > 0 ? (
                              <span className="font-medium">
                                {suggestedQty} {item.unit}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {estCost > 0 ? (
                              <span className="font-medium">${estCost.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Generate PO Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleGeneratePO}
              disabled={selectedItems.size === 0}
              className="flex items-center gap-2"
              data-testid="button-generate-po"
            >
              <ShoppingCart className="h-4 w-4" />
              Generate Draft PO
              {selectedItems.size > 0 && (
                <Badge variant="secondary" className="ml-1 bg-white/20 text-white">
                  {selectedItems.size}
                </Badge>
              )}
            </Button>
          </div>
        </>
      )}

      {/* PO Confirmation Dialog */}
      <Dialog open={showPODialog} onOpenChange={setShowPODialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Generate Draft Purchase Order
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Vendor Select */}
            <div className="space-y-2">
              <Label htmlFor="vendor-select">Vendor</Label>
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger id="vendor-select" data-testid="select-vendor">
                  <SelectValue placeholder="Select a vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No vendors found
                    </SelectItem>
                  ) : (
                    vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Line Items Summary */}
            <div className="space-y-2">
              <Label>Line Items</Label>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="p-2 text-left font-medium text-muted-foreground">Item</th>
                      <th className="p-2 text-right font-medium text-muted-foreground">Qty</th>
                      <th className="p-2 text-right font-medium text-muted-foreground">Unit Cost</th>
                      <th className="p-2 text-right font-medium text-muted-foreground">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkedItems.map((item) => {
                      const suggestedQty = getSuggestedOrderQty(item.quantity, item.reorderLevel);
                      const subtotal = suggestedQty * (item.costPerUnit ?? 0);
                      return (
                        <tr key={item.id} className="border-b border-border last:border-0">
                          <td className="p-2">{item.name}</td>
                          <td className="p-2 text-right">
                            {suggestedQty} {item.unit}
                          </td>
                          <td className="p-2 text-right">
                            ${(item.costPerUnit ?? 0).toFixed(2)}
                          </td>
                          <td className="p-2 text-right font-medium">${subtotal.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40">
                      <td colSpan={3} className="p-2 text-right font-semibold">
                        Total
                      </td>
                      <td className="p-2 text-right font-bold text-lg">${totalEstCost.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="po-notes">Notes (optional)</Label>
              <Textarea
                id="po-notes"
                placeholder="Add any notes for this purchase order..."
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                rows={3}
                data-testid="textarea-po-notes"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPODialog(false)}
              disabled={createPOMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPO}
              disabled={!selectedVendorId || createPOMutation.isPending}
              data-testid="button-confirm-po"
            >
              {createPOMutation.isPending ? "Creating..." : "Create Draft PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
