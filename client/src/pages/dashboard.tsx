import type { ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertTriangle, TrendingUp, Trash2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useLocation } from "@/contexts/LocationContext";
import MetricsCards from "@/components/dashboard/metrics-cards";
import LowStockAlerts from "@/components/dashboard/low-stock-alerts";
import RecentActivity from "@/components/dashboard/recent-activity";
import QuickActions from "@/components/dashboard/quick-actions";
import InventoryTable from "@/components/inventory/inventory-table";
import LocationBanner from "@/components/location/location-banner";
import QuickAddDashboard from "@/components/dashboard/quick-add-dashboard";

export default function Dashboard() {
  const { currentLocation } = useLocation();

  const { data: metrics, isLoading: metricsLoading } = useQuery<NonNullable<ComponentProps<typeof MetricsCards>["metrics"]>>({
    queryKey: ['/api/dashboard/metrics', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: lowStockItems = [], isLoading: lowStockLoading } = useQuery<NonNullable<ComponentProps<typeof LowStockAlerts>["items"]>>({
    queryKey: ['/api/inventory/low-stock', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: inventoryItems = [], isLoading: inventoryLoading } = useQuery<NonNullable<ComponentProps<typeof InventoryTable>["items"]>>({
    queryKey: ['/api/inventory', currentLocation?.id],
    enabled: !!currentLocation,
  });

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {/* Location Banner */}
      <LocationBanner />
      
      {/* Page Header - Compact on mobile */}
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm lg:text-base text-slate-300">
          {currentLocation ? `Overview of ${currentLocation.name} inventory` : 'Select a location to view dashboard'}
        </p>
      </div>

      {/* Key Metrics - Compact grid on mobile */}
      <MetricsCards metrics={metrics} isLoading={metricsLoading} />

      {/* Quick Actions - Horizontal scroll on mobile */}
      <div className="lg:hidden">
        <QuickActions />
      </div>

      {/* Charts and Quick Actions - Desktop layout */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-6">
        {/* Usage Trends Chart Placeholder */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Weekly Usage Trends</CardTitle>
              <select className="text-sm border border-slate-600 bg-slate-700/50 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 90 days</option>
              </select>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-slate-700/30 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-600">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-300">Chart visualization will be implemented</p>
                  <p className="text-sm text-slate-400 mt-2">Shows ingredient usage over time</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <QuickActions />
          <QuickAddDashboard />
        </div>
      </div>

      {/* Low Stock Alerts - Priority on mobile */}
      <LowStockAlerts items={lowStockItems} isLoading={lowStockLoading} />
      
      {/* Mobile: View full inventory link */}
      <div className="lg:hidden">
        <Link href="/inventory">
          <Button 
            variant="outline" 
            className="w-full bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-600/50 hover:text-white"
            data-testid="button-view-full-inventory"
          >
            View Full Inventory
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Recent Activity - Desktop only initially */}
      <div className="hidden lg:block">
        <RecentActivity />
      </div>

      {/* Inventory Table - Hidden on mobile, link to full inventory page instead */}
      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle>Current Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <InventoryTable 
            items={inventoryItems} 
            isLoading={inventoryLoading}
            showPagination={true}
            maxItems={10}
          />
        </CardContent>
      </Card>
    </div>
  );
}
