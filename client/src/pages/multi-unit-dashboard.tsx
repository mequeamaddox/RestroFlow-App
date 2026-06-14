import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Package, TrendingDown, TrendingUp, Calculator, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface StockLevel {
  id: string;
  name: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  availableRecipeUnits: number;
  recipeUnit: string;
  servingsPerPurchaseUnit?: number;
  costPerRecipeUnit: number;
  costPerServing?: number;
  totalValue: number;
  reorderLevel: number;
  isLowStock: boolean;
}

interface SalesAnalytics {
  salesSummary: {
    totalRevenue: number;
    totalTransactions: number;
    averageTransaction: number;
  };
  inventorySummary: {
    totalInventoryValue: number;
    totalItems: number;
    lowStockItems: number;
  };
  stockLevels: StockLevel[];
  recentTransactions: Array<{
    id: string;
    totalAmount: string;
    saleDate: string;
    customerName?: string;
    paymentMethod: string;
    items: Array<{
      inventoryItem: {
        name: string;
        recipeUnit: string;
      };
      quantitySold: string;
      unitPrice: string;
    }>;
  }>;
}

export default function MultiUnitDashboard() {
  const { currentLocation } = useLocation();
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<StockLevel | null>(null);
  const [saleQuantity, setSaleQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [isRecordingSale, setIsRecordingSale] = useState(false);
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());

  const { data: stockLevels, isLoading: loadingStock } = useQuery({
    queryKey: ['/api/inventory/stock-levels', currentLocation?.id],
    enabled: !!currentLocation?.id,
  });

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<SalesAnalytics>({
    queryKey: ['/api/sales/analytics', currentLocation?.id],
    enabled: !!currentLocation?.id,
  });

  const recordSale = async (item: StockLevel, quantity: number, unitPrice: number) => {
    if (!currentLocation?.id) return;
    
    setIsRecordingSale(true);
    try {
      await apiRequest(`/api/sales/transactions`, {
        method: 'POST',
        body: {
          locationId: currentLocation.id,
          totalAmount: quantity * unitPrice,
          paymentMethod: 'cash',
          customerName: 'Walk-in Customer',
          salesItems: [{
            inventoryItemId: item.id,
            quantitySold: quantity,
            unitPrice: unitPrice
          }]
        }
      });

      toast({
        title: "Sale Recorded",
        description: `${quantity} ${item.recipeUnit} of ${item.name} sold successfully. Inventory automatically updated.`,
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales/analytics'] });
      
      setSelectedItem(null);
      setSaleQuantity("");
      setUnitPrice("");
    } catch (error) {
      toast({
        title: "Error Recording Sale",
        description: "Failed to record the sale. Please try again.",
        variant: "destructive",
      });
    }
    setIsRecordingSale(false);
  };

  if (!currentLocation) {
    return (
      <div className="p-6">
        <div className="text-center">
          <p className="text-muted-foreground">Please select a location to view multi-unit inventory tracking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Multi-Unit Inventory Tracking</h1>
        <p className="text-muted-foreground">
          Track inventory in cases for ordering and lbs/oz for recipes with automatic sales deduction
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics?.inventorySummary.totalInventoryValue.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Across {analytics?.inventorySummary.totalItems || 0} items
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics?.salesSummary.totalRevenue.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              From {analytics?.salesSummary.totalTransactions || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Transaction</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics?.salesSummary.averageTransaction.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Per transaction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {analytics?.inventorySummary.lowStockItems || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Need reordering
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Inventory Levels</TabsTrigger>
          <TabsTrigger value="sales">Recent Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Multi-Unit Inventory Levels</CardTitle>
              <CardDescription>
                Track inventory in purchase units (cases) and recipe units (lbs/oz) with cost per unit calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingStock ? (
                  <p>Loading inventory...</p>
                ) : (
                  <div className="grid gap-4">
                    {stockLevels?.map((item: StockLevel) => (
                      <Card key={item.id} className={`${item.isLowStock ? 'border-red-800/50 bg-red-900/20' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold">{item.name}</h3>
                                {item.isLowStock && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Low Stock
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Purchase Units</p>
                                  <p className="font-medium">{item.purchaseQuantity} {item.purchaseUnit}</p>
                                </div>
                                
                                <div>
                                  <p className="text-muted-foreground">Recipe Units Available</p>
                                  <p className="font-medium">{item.availableRecipeUnits.toFixed(1)} {item.recipeUnit}</p>
                                </div>
                                
                                <div>
                                  <p className="text-muted-foreground">Cost per {item.recipeUnit}</p>
                                  <p className="font-medium">${item.costPerRecipeUnit.toFixed(2)}</p>
                                </div>
                                
                                <div>
                                  <p className="text-muted-foreground">Total Value</p>
                                  <p className="font-medium">${item.totalValue.toFixed(2)}</p>
                                </div>
                              </div>

                              {item.servingsPerPurchaseUnit && item.costPerServing && (
                                <div className="mt-2 pt-2 border-t">
                                  <div className="flex gap-4 text-sm">
                                    <div>
                                      <p className="text-muted-foreground">Servings per {item.purchaseUnit}</p>
                                      <p className="font-medium">{item.servingsPerPurchaseUnit}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">Cost per Serving</p>
                                      <p className="font-medium">${item.costPerServing.toFixed(2)}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <div className="ml-4">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                                    Record Sale
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Record Sale - {item.name}</DialogTitle>
                                    <DialogDescription>
                                      Record a sale and automatically deduct from inventory
                                    </DialogDescription>
                                  </DialogHeader>
                                  
                                  <div className="space-y-4">
                                    <div>
                                      <Label htmlFor="quantity">Quantity Sold ({item.recipeUnit})</Label>
                                      <Input
                                        id="quantity"
                                        type="number"
                                        step="0.1"
                                        value={saleQuantity}
                                        onChange={(e) => setSaleQuantity(e.target.value)}
                                        placeholder={`Enter quantity in ${item.recipeUnit}`}
                                      />
                                    </div>
                                    
                                    <div>
                                      <Label htmlFor="unitPrice">Price per {item.recipeUnit}</Label>
                                      <Input
                                        id="unitPrice"
                                        type="number"
                                        step="0.01"
                                        value={unitPrice}
                                        onChange={(e) => setUnitPrice(e.target.value)}
                                        placeholder="Enter price per unit"
                                      />
                                    </div>
                                    
                                    {saleQuantity && unitPrice && (
                                      <div className="p-3 bg-muted rounded-lg">
                                        <p className="text-sm">
                                          <strong>Total Sale:</strong> ${(parseFloat(saleQuantity) * parseFloat(unitPrice)).toFixed(2)}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          This will reduce inventory by {parseFloat(saleQuantity)} {item.recipeUnit}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <DialogFooter>
                                    <Button
                                      onClick={() => recordSale(item, parseFloat(saleQuantity), parseFloat(unitPrice))}
                                      disabled={!saleQuantity || !unitPrice || isRecordingSale}
                                    >
                                      {isRecordingSale ? "Recording..." : "Record Sale"}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sales Transactions</CardTitle>
              <CardDescription>
                View recent sales with automatic inventory deduction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingAnalytics ? (
                  <p>Loading sales data...</p>
                ) : analytics?.recentTransactions?.length === 0 ? (
                  <p className="text-muted-foreground">No sales transactions recorded yet.</p>
                ) : (
                  analytics?.recentTransactions?.map((transaction) => {
                    const isExpanded = expandedTransactions.has(transaction.id);
                    return (
                      <Card key={transaction.id} data-testid={`card-transaction-${transaction.id}`}>
                        <CardContent className="p-4">
                          <Collapsible
                            open={isExpanded}
                            onOpenChange={() => {
                              const newExpanded = new Set(expandedTransactions);
                              if (isExpanded) {
                                newExpanded.delete(transaction.id);
                              } else {
                                newExpanded.add(transaction.id);
                              }
                              setExpandedTransactions(newExpanded);
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold" data-testid={`text-amount-${transaction.id}`}>
                                  ${parseFloat(transaction.totalAmount).toFixed(2)}
                                </p>
                                <p className="text-sm text-muted-foreground" data-testid={`text-date-${transaction.id}`}>
                                  {new Date(transaction.saleDate).toLocaleDateString()} - {transaction.paymentMethod}
                                </p>
                                {transaction.customerName && (
                                  <p className="text-sm text-muted-foreground" data-testid={`text-customer-${transaction.id}`}>
                                    {transaction.customerName}
                                  </p>
                                )}
                              </div>
                              <CollapsibleTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  data-testid={`button-expand-${transaction.id}`}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </div>
                            
                            <CollapsibleContent>
                              <div className="space-y-3 pt-2 border-t">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">Items Sold:</p>
                                  {transaction.items?.map((item, index) => (
                                    <div 
                                      key={index} 
                                      className="flex justify-between text-sm pl-2"
                                      data-testid={`item-${transaction.id}-${index}`}
                                    >
                                      <span>{item.inventoryItem.name}</span>
                                      <span>
                                        {parseFloat(item.quantitySold).toFixed(1)} {item.inventoryItem.recipeUnit} × ${parseFloat(item.unitPrice).toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="pt-2">
                                  <Link href="/analytics">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="w-full"
                                      data-testid={`button-view-analytics-${transaction.id}`}
                                    >
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      View Detailed Analytics
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}