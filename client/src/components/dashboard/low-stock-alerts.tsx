import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Package } from "lucide-react";
import { type InventoryItem, type Category, type Vendor } from "@shared/schema";

interface LowStockAlertsProps {
  items?: (InventoryItem & { category?: Category; vendor?: Vendor })[];
  isLoading: boolean;
}

export default function LowStockAlerts({ items, isLoading }: LowStockAlertsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Low Stock Alerts</CardTitle>
          <Skeleton className="h-6 w-16" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="ml-3 space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const lowStockItems = items || [];

  const getCategoryIcon = (categoryName?: string) => {
    const iconMap: Record<string, string> = {
      'proteins': '🥩',
      'vegetables': '🥕',
      'dairy': '🧀',
      'beverages': '🥤',
      'dry goods': '🌾',
    };
    return iconMap[categoryName?.toLowerCase() || ''] || '📦';
  };

  const getStockLevel = (item: InventoryItem) => {
    const quantity = parseFloat(item.quantity);
    const reorderLevel = parseFloat(item.reorderLevel);
    const ratio = quantity / reorderLevel;
    
    if (ratio <= 0.5) {
      return { level: 'critical', color: 'bg-red-900/20 border-red-800/50', badge: 'bg-red-900/30 text-red-400 border border-red-800' };
    } else if (ratio <= 1) {
      return { level: 'low', color: 'bg-yellow-900/20 border-yellow-800/50', badge: 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' };
    }
    return { level: 'medium', color: 'bg-orange-900/20 border-orange-800/50', badge: 'bg-orange-900/30 text-orange-400 border border-orange-800' };
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Low Stock Alerts</CardTitle>
        <Badge variant="destructive" className="h-6">
          {lowStockItems.length} items
        </Badge>
      </CardHeader>
      <CardContent>
        {lowStockItems.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">All items are well stocked</h3>
            <p className="text-xs text-muted-foreground">No items are currently below their reorder levels.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lowStockItems.slice(0, 5).map((item) => {
              const stockInfo = getStockLevel(item);
              
              return (
                <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border ${stockInfo.color}`}>
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-lg">
                      {getCategoryIcon(item.category?.name)}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} {item.unit} remaining
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={stockInfo.badge}>
                      {stockInfo.level === 'critical' ? 'Critical' : 'Low Stock'}
                    </Badge>
                    <Button size="sm" className="mt-2 bg-primary-600 hover:bg-primary-700">
                      Reorder
                    </Button>
                  </div>
                </div>
              );
            })}
            
            {lowStockItems.length > 5 && (
              <Button variant="ghost" className="w-full text-primary-600 hover:text-primary-700">
                View All Low Stock Items ({lowStockItems.length - 5} more)
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
