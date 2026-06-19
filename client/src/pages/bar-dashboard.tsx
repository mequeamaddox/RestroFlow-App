import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "@/contexts/LocationContext";
import { apiRequest } from "@/lib/queryClient";
import { BarUpgradePrompt } from "@/components/bar/bar-upgrade-prompt";
import LocationBanner from "@/components/location/location-banner";
import {
  GlassWater,
  TrendingDown,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  BarChart3,
} from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: string;
  totalCost: number;
  pourCostPct: number;
  ingredientCount: number;
}

interface WasteReason {
  count: number;
  cost: number;
}

interface PourCostSummary {
  menuItems: MenuItem[];
  avgPourCostPct: number;
  wasteLast7Days: {
    totalCost: number;
    entryCount: number;
    byReason: Record<string, WasteReason>;
  };
  lastCounts: Array<{
    id: string;
    countDate: string;
    shift: string;
    status: string;
  }>;
}

const WASTE_REASON_LABELS: Record<string, string> = {
  spillage: "Spillage",
  breakage: "Breakage",
  comp: "Comp / Comped",
  over_pour: "Over-Pour",
  theft: "Theft",
  other: "Other",
};

function pourCostColor(pct: number): string {
  if (pct <= 20) return "text-emerald-400";
  if (pct <= 30) return "text-yellow-400";
  return "text-red-400";
}

function pourCostBadgeClass(pct: number): string {
  if (pct <= 20) return "bg-emerald-900/60 text-emerald-300 border-emerald-700";
  if (pct <= 30) return "bg-yellow-900/60 text-yellow-300 border-yellow-700";
  return "bg-red-900/60 text-red-300 border-red-700";
}

function pourCostLabel(pct: number): string {
  if (pct <= 20) return "On Target";
  if (pct <= 30) return "Watch";
  return "High";
}

function avgPourCostCardColor(pct: number): string {
  if (pct <= 20) return "text-emerald-400";
  if (pct <= 30) return "text-yellow-400";
  return "text-red-400";
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function SummaryCardSkeleton() {
  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32 bg-slate-700" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 bg-slate-700 mb-1" />
        <Skeleton className="h-3 w-28 bg-slate-700" />
      </CardContent>
    </Card>
  );
}

function TableRowSkeleton() {
  return (
    <tr className="border-b border-slate-800">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full bg-slate-700" />
        </td>
      ))}
    </tr>
  );
}

export default function BarDashboard() {
  const { currentLocation, hasBarAccess } = useLocation();

  const { data, isLoading } = useQuery<PourCostSummary>({
    queryKey: ["/api/bar/pour-cost-summary", currentLocation?.id],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/bar/pour-cost-summary?locationId=${currentLocation?.id}`
      ).then((r) => r.json()),
    enabled: !!currentLocation && hasBarAccess,
  });

  if (!hasBarAccess) {
    return (
      <BarUpgradePrompt locationName={currentLocation?.name || "this location"} />
    );
  }

  const menuItems = data?.menuItems ?? [];
  const sortedItems = [...menuItems].sort(
    (a, b) => b.pourCostPct - a.pourCostPct
  );

  const avgPourCost = data?.avgPourCostPct ?? 0;
  const wasteCost = data?.wasteLast7Days?.totalCost ?? 0;
  const wasteEntries = data?.wasteLast7Days?.entryCount ?? 0;
  const byReason = data?.wasteLast7Days?.byReason ?? {};
  const activeReasons = Object.entries(byReason).filter(
    ([, v]) => v.count > 0
  );

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6 bg-slate-950 min-h-screen">
      <LocationBanner />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-600 to-violet-700">
              <GlassWater className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl lg:text-3xl font-bold text-white">
              Bar Pour Cost Dashboard
            </h1>
          </div>
          <p className="text-xs lg:text-sm text-slate-400 mt-1 ml-0.5">
            Monitor pour cost percentages, track waste, and manage your beverage
            program profitability.
          </p>
        </div>
        <Link href="/bar/inventory">
          <Button
            variant="outline"
            className="border-purple-600 text-purple-300 hover:bg-purple-900/30 hover:text-purple-200 shrink-0"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Run Inventory Count
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
            <SummaryCardSkeleton />
          </>
        ) : (
          <>
            {/* Average Pour Cost % */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-slate-400">
                  Avg Pour Cost %
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-3xl font-bold ${avgPourCostCardColor(avgPourCost)}`}
                >
                  {avgPourCost.toFixed(1)}%
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {avgPourCost <= 20
                    ? "Excellent — within target"
                    : avgPourCost <= 30
                    ? "Acceptable — monitor closely"
                    : "Above target — action needed"}
                </p>
              </CardContent>
            </Card>

            {/* Waste Cost This Week */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-slate-400">
                  Waste Cost This Week
                </CardTitle>
                <TrendingDown className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(wasteCost)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {wasteEntries} waste{" "}
                  {wasteEntries === 1 ? "entry" : "entries"} logged
                </p>
              </CardContent>
            </Card>

            {/* Menu Items Tracked */}
            <Card className="bg-slate-900/50 border-slate-700">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-slate-400">
                  Menu Items Tracked
                </CardTitle>
                <GlassWater className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">
                  {menuItems.length}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Cocktails &amp; spirits with cost data
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Menu Item Pour Costs Table */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-purple-500 to-violet-600" />
            Menu Item Pour Costs
          </CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Sorted by pour cost % — highest first so problem items surface
            immediately.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">
                    Category
                  </th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">
                    Sale Price
                  </th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">
                    Cost
                  </th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">
                    Pour Cost %
                  </th>
                  <th className="text-center px-4 py-3 text-slate-400 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                  </>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      <GlassWater className="h-8 w-8 mx-auto mb-3 text-slate-700" />
                      <p className="font-medium text-slate-400 mb-1">
                        No cocktails yet
                      </p>
                      <p className="text-xs mb-4">
                        Add beverages to your menu to start tracking pour costs.
                      </p>
                      <Link href="/beverage-menu">
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white"
                        >
                          Go to Beverage Menu
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-800/70 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">
                        {item.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className="border-slate-600 text-slate-300 bg-slate-800/50 text-xs capitalize"
                        >
                          {item.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                        {formatCurrency(parseFloat(item.price))}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                        {formatCurrency(item.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`tabular-nums font-semibold ${pourCostColor(item.pourCostPct)}`}
                        >
                          {item.pourCostPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs font-medium ${pourCostBadgeClass(item.pourCostPct)}`}
                        >
                          {item.pourCostPct > 30 && (
                            <AlertTriangle className="h-3 w-3 mr-1 inline-block" />
                          )}
                          {pourCostLabel(item.pourCostPct)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Row: Waste Breakdown + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Waste This Week Breakdown */}
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-purple-500 to-violet-600" />
              Waste This Week
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Last 7 days — by reason
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between items-center">
                    <Skeleton className="h-4 w-24 bg-slate-700" />
                    <Skeleton className="h-4 w-20 bg-slate-700" />
                  </div>
                ))}
              </div>
            ) : activeReasons.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                <TrendingDown className="h-7 w-7 mx-auto mb-2 text-slate-700" />
                <p className="text-sm text-slate-400 font-medium">
                  No waste logged this week
                </p>
                <p className="text-xs mt-1">Great work keeping waste down!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeReasons.map(([reason, stats]) => (
                  <div
                    key={reason}
                    className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 text-sm font-medium">
                        {WASTE_REASON_LABELS[reason] ?? reason}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-slate-700 text-slate-400 bg-slate-800/40 text-xs tabular-nums"
                      >
                        {stats.count}x
                      </Badge>
                    </div>
                    <span className="text-red-400 font-semibold text-sm tabular-nums">
                      {formatCurrency(stats.cost)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 mt-1">
                  <span className="text-slate-400 text-sm font-semibold">
                    Total
                  </span>
                  <span className="text-white font-bold tabular-nums">
                    {formatCurrency(wasteCost)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-purple-500 to-violet-600" />
              Quick Actions
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Jump to common bar management tasks
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/bar/waste-log">
              <Button
                variant="outline"
                className="w-full justify-between border-slate-700 text-slate-300 hover:bg-slate-800/60 hover:text-white group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-red-900/40 group-hover:bg-red-900/60 transition-colors">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium leading-tight">
                      Log Waste
                    </p>
                    <p className="text-xs text-slate-500 leading-tight mt-0.5">
                      Record spillage, breakage, comps &amp; more
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </Button>
            </Link>

            <Link href="/bar/inventory">
              <Button
                variant="outline"
                className="w-full justify-between border-slate-700 text-slate-300 hover:bg-slate-800/60 hover:text-white group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-violet-900/40 group-hover:bg-violet-900/60 transition-colors">
                    <ClipboardList className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium leading-tight">
                      Run Inventory Count
                    </p>
                    <p className="text-xs text-slate-500 leading-tight mt-0.5">
                      Count spirits, wine &amp; beer on hand
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </Button>
            </Link>

            <Link href="/beverage-menu">
              <Button
                variant="outline"
                className="w-full justify-between border-slate-700 text-slate-300 hover:bg-slate-800/60 hover:text-white group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-purple-900/40 group-hover:bg-purple-900/60 transition-colors">
                    <GlassWater className="h-4 w-4 text-purple-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium leading-tight">
                      View Beverage Menu
                    </p>
                    <p className="text-xs text-slate-500 leading-tight mt-0.5">
                      Manage cocktails, spirits &amp; recipes
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
