import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "@/contexts/LocationContext";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  DollarSign,
  ShoppingCart,
  Users,
  Activity,
  Calendar,
  BarChart3,
  PieChart,
  Target,
  Bell,
  Clock,
  Zap,
  Eye,
  CheckCircle,
  Package,
  ChefHat,
  RefreshCw
} from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { Recipe } from "@shared/schema";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

interface Alert {
  id: string;
  alertType: string;
  severity: string;
  threshold: string;
  actualValue: string;
  variance: string;
  createdAt: string;
  item?: {
    name: string;
  };
}

interface BusinessIntelligence {
  id: string;
  reportDate: string;
  totalRevenue: string;
  totalCogs: string;
  grossMargin: string;
  foodCostPercentage: string;
  wastePercentage: string;
  inventoryTurnover: string;
  avgOrderValue: string;
  customerCount: number;
  topSellingItems: any[];
  lowPerformingItems: any[];
  trends: any;
}

interface PLReport {
  period: { startDate: Date; endDate: Date };
  revenue: {
    total: number;
    transactionCount: number;
    averageTicket: number;
  };
  cogs: {
    total: number;
    percentage: number;
  };
  margins: {
    grossProfit: number;
    grossMarginPercentage: number;
  };
}

interface VarianceReport {
  itemId: string;
  itemName: string;
  theoreticalUsage: number;
  actualUsage: number;
  variance: number;
  variancePercentage: number;
  varianceCost: number;
  category: 'acceptable' | 'high' | 'critical';
}

interface ProductionVariance {
  recipeId: string;
  recipeName: string;
  quantityProduced: number;
  theoreticalCost: number;
  actualCost: number;
  variance: number;
  variancePercentage: number;
}

interface VarianceSummary {
  totalVarianceCost: number;
  criticalVariances: number;
  highVariances: number;
  totalAnalyzedItems: number;
}

interface RealTimeData {
  currentSales: number;
  ordersToday: number;
  avgOrderValue: number;
  activeTables?: number;
  kitchenWaitTime: number;
  topSellingItems: Array<{
    name: string;
    sold: number;
    revenue: number;
  }>;
}

interface WasteData {
  category: string;
  amount: number;
  cost: number;
  color: string;
}

export default function Analytics() {
  const { currentLocation } = useLocation();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("today");
  const [timeRange, setTimeRange] = useState("30d");
  const [locationFilter, setLocationFilter] = useState("all");
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Variance analysis state
  const [varianceDateRange, setVarianceDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedRecipe, setSelectedRecipe] = useState<string>('');
  const [productionQuantity, setProductionQuantity] = useState<string>('');

  // Update time every second for real-time feel
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch real-time sales data from POS integrations
  const { data: realTimeData, isLoading: realTimeLoading } = useQuery<RealTimeData>({
    queryKey: ['/api/analytics/realtime', currentLocation?.id],
    enabled: !!currentLocation,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch sales trend data
  const { data: salesTrendData = [], isLoading: salesTrendLoading } = useQuery<any[]>({
    queryKey: ['/api/analytics/sales-trend', currentLocation?.id, timeRange],
    enabled: !!currentLocation,
  });

  // Fetch inventory alerts (low stock items)
  const { data: lowStockItems = [], isLoading: inventoryAlertsLoading } = useQuery<any[]>({
    queryKey: ['/api/inventory/low-stock', currentLocation?.id],
    enabled: !!currentLocation,
  });

  // Transform inventory alerts to match expected format
  const inventoryAlerts = lowStockItems.map((item: any) => ({
    item: item.name,
    current: parseFloat(item.quantity),
    min: parseFloat(item.reorderLevel || '0'),
    severity: parseFloat(item.quantity) <= parseFloat(item.reorderLevel || '0') * 0.5 ? 'high' : 
              parseFloat(item.quantity) <= parseFloat(item.reorderLevel || '0') ? 'medium' : 'low',
    location: currentLocation?.name || 'Unknown'
  }));

  // Fetch waste data
  const { data: wasteData = [], isLoading: wasteLoading } = useQuery<WasteData[]>({
    queryKey: ['/api/waste/summary', currentLocation?.id, timeRange],
    enabled: !!currentLocation,
  });

  // Fetch cost alerts data - this is already real from the database
  // No need to replace as alerts query below fetches real data

  // Fetch cost alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery<Alert[]>({
    queryKey: ["/api/analytics/alerts", currentLocation?.id],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/alerts?locationId=${currentLocation?.id}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentLocation?.id,
  });

  // Fetch business intelligence data
  const { data: biData, isLoading: biLoading } = useQuery<BusinessIntelligence | null>({
    queryKey: ["/api/analytics/business-intelligence", currentLocation?.id, selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/business-intelligence?locationId=${currentLocation?.id}&period=${selectedPeriod}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!currentLocation?.id,
  });

  // Fetch P&L report
  const { data: plReport, isLoading: plLoading } = useQuery<PLReport | null>({
    queryKey: ["/api/analytics/profit-loss", currentLocation?.id, selectedPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/profit-loss?locationId=${currentLocation?.id}&period=${selectedPeriod}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!currentLocation?.id,
  });

  // Business Intelligence queries
  const { data: dailyPnL = [] } = useQuery({
    queryKey: ["/api/business-intelligence/daily-pnl", timeRange, locationFilter],
    queryFn: () => apiRequest("GET", `/api/business-intelligence/daily-pnl?range=${timeRange}&location=${locationFilter}`).then(r => r.json()),
  });

  const { data: kpiMetrics } = useQuery({
    queryKey: ["/api/business-intelligence/kpis", timeRange, locationFilter],
    queryFn: () => apiRequest("GET", `/api/business-intelligence/kpis?range=${timeRange}&location=${locationFilter}`).then(r => r.json()),
  });

  const { data: profitabilityAnalysis = [] } = useQuery({
    queryKey: ["/api/business-intelligence/profitability", timeRange, locationFilter],
    queryFn: () => apiRequest("GET", `/api/business-intelligence/profitability?range=${timeRange}&location=${locationFilter}`).then(r => r.json()),
  });

  const { data: menuPerformance = [] } = useQuery({
    queryKey: ["/api/business-intelligence/menu-performance", timeRange, locationFilter],
    queryFn: () => apiRequest("GET", `/api/business-intelligence/menu-performance?range=${timeRange}&location=${locationFilter}`).then(r => r.json()),
  });

  const { data: costAnalysis } = useQuery({
    queryKey: ["/api/business-intelligence/cost-analysis", timeRange, locationFilter],
    queryFn: () => apiRequest("GET", `/api/business-intelligence/cost-analysis?range=${timeRange}&location=${locationFilter}`).then(r => r.json()),
  });

  // Cost monitoring queries
  const { data: costAlertsData = [] } = useQuery({
    queryKey: ["/api/cost-alerts", locationFilter],
    queryFn: () => apiRequest("GET", `/api/cost-alerts?location=${locationFilter}`).then(r => r.json()),
  });

  const { data: priceMonitoring = [] } = useQuery({
    queryKey: ["/api/price-monitoring", timeRange],
    queryFn: () => apiRequest("GET", `/api/price-monitoring?range=${timeRange}`).then(r => r.json()),
  });

  const { data: costTrends = [] } = useQuery({
    queryKey: ["/api/cost-trends", timeRange, locationFilter],
    queryFn: () => apiRequest("GET", `/api/cost-trends?range=${timeRange}&location=${locationFilter}`).then(r => r.json()),
  });

  const { data: budgetTracking } = useQuery({
    queryKey: ["/api/budget-tracking", locationFilter],
    queryFn: () => apiRequest("GET", `/api/budget-tracking?location=${locationFilter}`).then(r => r.json()),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    queryFn: () => apiRequest("GET", "/api/locations").then(r => r.json()),
  });

  // Variance analysis queries
  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ['/api/recipes'],
  });

  const { data: varianceSummary } = useQuery<VarianceSummary>({
    queryKey: ['/api/variance/summary', currentLocation?.id],
    enabled: !!currentLocation?.id,
  });

  const { data: varianceReport = [], isLoading: isVarianceLoading } = useQuery<VarianceReport[]>({
    queryKey: ['/api/variance/report', currentLocation?.id, varianceDateRange.startDate, varianceDateRange.endDate],
    enabled: !!currentLocation?.id,
  });

  const { data: productionVariance = [] } = useQuery<ProductionVariance[]>({
    queryKey: ['/api/variance/production', currentLocation?.id, varianceDateRange.startDate, varianceDateRange.endDate],
    enabled: !!currentLocation?.id,
  });

  // Record recipe production mutation
  const recordProductionMutation = useMutation({
    mutationFn: async (data: { recipeId: string; quantity: number; batchNumber?: string }) => {
      return apiRequest('POST', '/api/variance/production', {
        recipeId: data.recipeId,
        locationId: currentLocation?.id,
        quantityProduced: data.quantity,
        batchNumber: data.batchNumber
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/variance'] });
      setSelectedRecipe('');
      setProductionQuantity('');
    },
  });

  // Generate variance report mutation
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/variance/generate', {
        locationId: currentLocation?.id,
        startDate: varianceDateRange.startDate,
        endDate: varianceDateRange.endDate
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/variance'] });
    },
  });

  if (!currentLocation) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Location Selected</h2>
          <p className="text-muted-foreground">Please select a location to view analytics.</p>
        </div>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getAlertSeverityBadge = (severity: string) => {
    const severityConfig = {
      low: { color: "bg-blue-500", label: "Low" },
      medium: { color: "bg-yellow-500", label: "Medium" },
      high: { color: "bg-orange-500", label: "High" },
      critical: { color: "bg-red-500", label: "Critical" },
    };
    const config = severityConfig[severity as keyof typeof severityConfig] || severityConfig.medium;
    return <Badge className={`${config.color} text-white`}>{config.label}</Badge>;
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'price_variance':
        return <TrendingUp className="h-4 w-4 text-orange-400" />;
      case 'budget_exceeded':
        return <Target className="h-4 w-4 text-red-400" />;
      case 'waste_threshold':
        return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
      case 'low_margin':
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      default:
        return <Bell className="h-4 w-4 text-blue-400" />;
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num || 0);
  };

  const formatPercentage = (value: string | number, total?: number) => {
    if (total !== undefined) {
      if (total === 0) return '0%';
      const num = typeof value === 'string' ? parseFloat(value) : value;
      return `${((num / total) * 100).toFixed(1)}%`;
    }
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${(num || 0).toFixed(1)}%`;
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 5) return "text-red-400";
    if (variance > 0) return "text-orange-400";
    if (variance > -5) return "text-green-400";
    return "text-emerald-400";
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'critical': return 'bg-red-900/30 text-red-400 border border-red-800';
      case 'high': return 'bg-yellow-900/30 text-yellow-400 border border-yellow-800';
      default: return 'bg-green-900/30 text-green-400 border border-green-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'high': return <TrendingUp className="h-4 w-4 text-yellow-600" />;
      default: return <Package className="h-4 w-4 text-green-600" />;
    }
  };

  const COLORS = ['#F97316', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B', '#06B6D4', '#84CC16'];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="h-8 w-8 text-green-400" />
            Analytics & Reports
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time insights, cost control, and business intelligence for {currentLocation.name}
          </p>
          <p className="text-sm text-muted-foreground">
            Last update: {currentTime.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm">Live</span>
          </div>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cost Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Cost Alerts
          </CardTitle>
          <CardDescription>
            Active alerts requiring attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <div className="text-center py-8">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active alerts
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert: Alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <Badge variant={getSeverityColor(alert.severity)}>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <div>
                      <p className="font-medium">
                        {alert.alertType?.replace('_', ' ').toUpperCase() || 'ALERT'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {alert.item?.name && `${alert.item.name} - `}
                        Threshold: {formatPercentage(alert.threshold)}, 
                        Actual: {formatPercentage(alert.actualValue)}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Acknowledge
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex h-12 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground min-w-max">
            <TabsTrigger value="overview" className="whitespace-nowrap px-4 py-2 text-sm">Overview</TabsTrigger>
            <TabsTrigger value="performance" className="whitespace-nowrap px-4 py-2 text-sm">Performance Insights</TabsTrigger>
            <TabsTrigger value="cost-waste" className="whitespace-nowrap px-4 py-2 text-sm">Cost & Waste</TabsTrigger>
            <TabsTrigger value="reports" className="whitespace-nowrap px-4 py-2 text-sm">Reports & Exports</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab - Real-Time Metrics + Dashboard */}
        <TabsContent value="overview" className="space-y-6">
          {/* Live Metrics */}
          {realTimeLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4 text-center">
                    <div className="h-6 w-6 bg-slate-700 rounded mx-auto mb-2 animate-pulse" />
                    <div className="h-6 bg-slate-700 rounded w-24 mx-auto mb-2 animate-pulse" />
                    <div className="h-4 bg-slate-700 rounded w-32 mx-auto animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4 text-center">
                  <DollarSign className="h-6 w-6 text-green-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-green-400">
                    ${realTimeData?.currentSales?.toLocaleString() || '0'}
                  </div>
                  <div className="text-xs text-slate-400">Sales (Last 7 Days)</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4 text-center">
                  <ShoppingCart className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">{realTimeData?.ordersToday || 0}</div>
                  <div className="text-xs text-slate-400">Orders (Last 7 Days)</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4 text-center">
                  <Target className="h-6 w-6 text-purple-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">${realTimeData?.avgOrderValue?.toFixed(2) || '0.00'}</div>
                  <div className="text-xs text-slate-400">Avg Order Value</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Live Sales Trend */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                Live Sales Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesTrendLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-pulse text-slate-400">Loading chart data...</div>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#9CA3AF"
                        tickFormatter={(date) => {
                          try {
                            return date ? format(new Date(date), 'MMM d') : '';
                          } catch {
                            return '';
                          }
                        }}
                      />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151', 
                          borderRadius: '6px',
                          color: '#F3F4F6'
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke="#10B981"
                        fill="url(#salesGradient)"
                        strokeWidth={2}
                      />
                      <defs>
                        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Real-Time Inventory Alerts */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  Live Inventory Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inventoryAlerts.map((alert: any, index: number) => (
                    <div key={index} className={`p-3 rounded-lg border-l-4 ${
                      alert.severity === 'high' ? 'bg-red-500/10 border-red-500' :
                      alert.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500' :
                      'bg-blue-500/10 border-blue-500'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{alert.item}</div>
                          <div className="text-sm text-slate-400">{alert.location}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold ${
                            alert.severity === 'high' ? 'text-red-400' :
                            alert.severity === 'medium' ? 'text-yellow-400' :
                            'text-blue-400'
                          }`}>
                            {alert.current} left
                          </div>
                          <div className="text-xs text-slate-400">min: {alert.min}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Selling Items Today */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-400" />
                  Top Performers Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {realTimeData?.topSellingItems?.map((item, index) => (

                    <div key={index} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                      <div>
                        <div className="font-medium text-white">{item.name}</div>
                        <div className="text-sm text-slate-400">{item.sold} sold today</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-green-400">${item.revenue}</div>
                        <div className="text-xs text-slate-400">revenue</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Period-based Business Intelligence Metrics */}
          {biLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 animate-pulse" />
                    <div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-2 animate-pulse" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20 animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(biData?.totalRevenue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPeriod === 'today' ? 'Today' : selectedPeriod === 'week' ? 'This Week' : selectedPeriod === 'month' ? 'This Month' : 'This Quarter'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Food Cost %</CardTitle>
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatPercentage(biData?.foodCostPercentage || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Target: 28-32%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(biData?.avgOrderValue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPeriod === 'today' ? 'Today' : selectedPeriod === 'week' ? 'This Week' : selectedPeriod === 'month' ? 'This Month' : 'This Quarter'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Customer Count</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {biData?.customerCount || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPeriod === 'today' ? 'Today' : selectedPeriod === 'week' ? 'This Week' : selectedPeriod === 'month' ? 'This Month' : 'This Quarter'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Top/Low Performing Items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Items</CardTitle>
                <CardDescription>Most popular menu items</CardDescription>
              </CardHeader>
              <CardContent>
                {biData?.topSellingItems && biData.topSellingItems.length > 0 ? (
                  <div className="space-y-3">
                    {biData.topSellingItems.slice(0, 5).map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.quantity} sold
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(item.revenue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No sales data available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Low Performing Items</CardTitle>
                <CardDescription>Items with low margins or sales</CardDescription>
              </CardHeader>
              <CardContent>
                {biData?.lowPerformingItems && biData.lowPerformingItems.length > 0 ? (
                  <div className="space-y-3">
                    {biData.lowPerformingItems.slice(0, 5).map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatPercentage(item.margin)} margin
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {item.quantity} sold
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No underperforming items</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Insights Tab - Business Intelligence + Trends */}
        <TabsContent value="performance" className="space-y-6">
          {/* KPI Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Gross Profit Margin</p>
                    <p className="text-2xl font-bold text-white">
                      {formatPercentage(kpiMetrics?.grossMargin || 0)}
                    </p>
                    <div className="flex items-center text-xs mt-1">
                      {(kpiMetrics?.marginVariance || 0) > 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-400 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400 mr-1" />
                      )}
                      <span className={getVarianceColor(kpiMetrics?.marginVariance || 0)}>
                        {Math.abs(kpiMetrics?.marginVariance || 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <Target className="h-8 w-8 text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Food Cost %</p>
                    <p className="text-2xl font-bold text-white">
                      {formatPercentage(kpiMetrics?.foodCostPercentage || 0)}
                    </p>
                    <div className="flex items-center text-xs mt-1">
                      <span className="text-slate-400">Target: 28-32%</span>
                    </div>
                  </div>
                  <DollarSign className="h-8 w-8 text-orange-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Average Order Value</p>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(kpiMetrics?.avgOrderValue || 0)}
                    </p>
                    <div className="flex items-center text-xs mt-1">
                      {(kpiMetrics?.aovVariance || 0) > 0 ? (
                        <TrendingUp className="h-3 w-3 text-green-400 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400 mr-1" />
                      )}
                      <span className={getVarianceColor(kpiMetrics?.aovVariance || 0)}>
                        {formatPercentage(Math.abs(kpiMetrics?.aovVariance || 0))}
                      </span>
                    </div>
                  </div>
                  <ShoppingCart className="h-8 w-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Customer Count</p>
                    <p className="text-2xl font-bold text-white">
                      {kpiMetrics?.customerCount?.toLocaleString() || 0}
                    </p>
                    <div className="flex items-center text-xs mt-1">
                      <span className="text-slate-400">vs last period</span>
                    </div>
                  </div>
                  <Users className="h-8 w-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Menu Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Top Performing Items</CardTitle>
                <CardDescription className="text-slate-400">
                  Highest profit margin and volume
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {menuPerformance.slice(0, 8).map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded bg-green-500/20 flex items-center justify-center mr-3">
                          <span className="text-green-400 text-sm font-bold">{index + 1}</span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{item.name}</p>
                          <p className="text-slate-400 text-xs">
                            {item.unitsSold} sold • {formatPercentage(item.margin)} margin
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">{formatCurrency(item.profit)}</p>
                        <p className="text-green-400 text-xs">profit</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Improvement Opportunities</CardTitle>
                <CardDescription className="text-slate-400">
                  Items needing attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {profitabilityAnalysis.slice(0, 8).map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center">
                      <div>
                        <p className="text-white font-medium">{item.name}</p>
                        <p className="text-slate-400 text-xs">
                          {formatPercentage(item.currentMargin)} margin (Target: {formatPercentage(item.targetMargin)})
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-orange-400 border-orange-400">
                          {item.improvement > 0 ? '+' : ''}{formatCurrency(item.improvement)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profitability Analysis Chart */}
          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <PieChart className="h-5 w-5 mr-2" />
                Product Category Profitability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={profitabilityAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F3F4F6'
                    }}
                  />
                  <Bar dataKey="currentMargin" fill="#F97316" name="Current Margin" />
                  <Bar dataKey="targetMargin" fill="#10B981" name="Target Margin" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Trends Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Trends</CardTitle>
                <CardDescription>Inventory turnover and performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Inventory Turnover</span>
                    <span className="font-medium">
                      {biData?.inventoryTurnover || 0}x
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Days of Inventory</span>
                    <span className="font-medium">
                      {Math.round(365 / parseFloat(biData?.inventoryTurnover || '1'))} days
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
                <CardDescription>Current period cost analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Food Cost</span>
                    <span className="font-medium">
                      {formatPercentage(biData?.foodCostPercentage || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Waste</span>
                    <span className="font-medium">
                      {formatPercentage(biData?.wastePercentage || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Gross Margin</span>
                    <span className="font-medium text-green-600">
                      {formatPercentage(biData?.grossMargin || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reports & Exports Tab */}
        <TabsContent value="reports" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Statement</CardTitle>
              <CardDescription>
                Financial performance for {selectedPeriod}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <div className="text-center py-8">Loading P&L report...</div>
              ) : plReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Revenue</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Total Sales</span>
                          <span>{formatCurrency(plReport.revenue?.total || 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Average Ticket</span>
                          <span>{formatCurrency(plReport.revenue?.averageTicket || 0)}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Cost of Goods Sold</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Total COGS</span>
                          <span>{formatCurrency(plReport.cogs?.total || 0)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>COGS %</span>
                          <span>{formatPercentage(plReport.cogs?.percentage || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <hr />
                  <div>
                    <h4 className="font-semibold mb-2">Gross Profit</h4>
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Gross Profit</span>
                      <span className="text-green-600">
                        {formatCurrency(plReport.margins?.grossProfit || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Gross Margin %</span>
                      <span>{formatPercentage(plReport.margins?.grossMarginPercentage || 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No P&L data available</p>
              )}
            </CardContent>
          </Card>

          {/* Daily P&L Chart */}
          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Daily Controllable P&L
              </CardTitle>
              <CardDescription className="text-slate-400">
                Revenue, costs, and profitability trends over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={dailyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF"
                    tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                  />
                  <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value.toLocaleString()}`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F3F4F6'
                    }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, '']}
                    labelFormatter={(label) => format(new Date(label), 'MMM dd, yyyy')}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stackId="1"
                    stroke="#10B981" 
                    fill="#10B981" 
                    fillOpacity={0.3}
                    name="Revenue"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cogs" 
                    stackId="2"
                    stroke="#F97316" 
                    fill="#F97316" 
                    fillOpacity={0.3}
                    name="Cost of Goods"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="grossProfit" 
                    stroke="#3B82F6" 
                    strokeWidth={3}
                    name="Gross Profit"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost & Waste Tab */}
        <TabsContent value="cost-waste" className="space-y-6">
          {/* Budget Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Food Cost %</p>
                    <p className="text-2xl font-bold text-white">
                      {budgetTracking?.foodCostPercentage || 0}%
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Target: 28-32%</p>
                  </div>
                  <div className="h-16 w-16 relative">
                    <svg className="transform -rotate-90 w-16 h-16" viewBox="0 0 36 36">
                      <path
                        className="stroke-slate-600 fill-none"
                        strokeWidth="2"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="stroke-orange-400 fill-none"
                        strokeWidth="2"
                        strokeDasharray={`${(budgetTracking?.foodCostPercentage || 0) * 100 / 35}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <DollarSign className="h-8 w-8 text-green-400" />
                  <div className="ml-4">
                    <p className="text-sm text-slate-400">Monthly Spend</p>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(budgetTracking?.monthlySpend || 0)}
                    </p>
                    <div className="flex items-center text-xs mt-1">
                      {(budgetTracking?.spendVariance || 0) > 0 ? (
                        <TrendingUp className="h-3 w-3 text-red-400 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-green-400 mr-1" />
                      )}
                      <span className={(budgetTracking?.spendVariance || 0) > 0 ? "text-red-400" : "text-green-400"}>
                        {Math.abs(budgetTracking?.spendVariance || 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-400" />
                  <div className="ml-4">
                    <p className="text-sm text-slate-400">Active Alerts</p>
                    <p className="text-2xl font-bold text-white">{costAlertsData.length}</p>
                    <p className="text-xs text-slate-400 mt-1">Require attention</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Activity className="h-8 w-8 text-blue-400" />
                  <div className="ml-4">
                    <p className="text-sm text-slate-400">Price Changes</p>
                    <p className="text-2xl font-bold text-white">{priceMonitoring.length}</p>
                    <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost Trends Chart */}
          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Cost Trends
              </CardTitle>
              <CardDescription className="text-slate-400">
                Daily cost analysis and variance tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={costTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#F3F4F6'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="actualCost" 
                    stackId="1"
                    stroke="#F97316" 
                    fill="#F97316" 
                    fillOpacity={0.3}
                    name="Actual Cost"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="budgetedCost" 
                    stackId="2"
                    stroke="#10B981" 
                    fill="#10B981" 
                    fillOpacity={0.3}
                    name="Budgeted Cost"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Cost Alerts */}
            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Bell className="h-5 w-5 mr-2" />
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {costAlertsData.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">No active alerts</p>
                  ) : (
                    costAlertsData.slice(0, 5).map((alert: any) => (
                      <div key={alert.id} className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50">
                        <div className="flex items-center space-x-3">
                          {getAlertTypeIcon(alert.alertType)}
                          <div>
                            <p className="text-white font-medium">{alert.itemName}</p>
                            <p className="text-sm text-slate-400">
                              {alert.alertType === 'price_variance' && `Price changed by ${alert.variance}%`}
                              {alert.alertType === 'budget_exceeded' && `Budget exceeded by ${formatCurrency(alert.variance)}`}
                              {alert.alertType === 'waste_threshold' && `Waste above threshold: ${alert.actualValue}%`}
                              {alert.alertType === 'low_margin' && `Margin below target: ${alert.actualValue}%`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getAlertSeverityBadge(alert.severity)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Price Monitoring */}
            <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Recent Price Changes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {priceMonitoring.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">No recent price changes</p>
                  ) : (
                    priceMonitoring.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{item.itemName}</p>
                          <p className="text-sm text-slate-400">{item.vendorName}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-400 line-through">
                              {formatCurrency(item.previousPrice)}
                            </span>
                            <span className="text-white font-bold">
                              {formatCurrency(item.currentPrice)}
                            </span>
                          </div>
                          <div className={`flex items-center text-sm ${
                            item.percentageChange > 0 ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {item.percentageChange > 0 ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {Math.abs(item.percentageChange).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Budget Performance */}
          <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Budget Performance by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {budgetTracking?.categoryBreakdown?.map((category: any) => (
                  <div key={category.name}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-white font-medium">{category.name}</span>
                      <div className="text-right">
                        <span className="text-white">{formatCurrency(category.actual)}</span>
                        <span className="text-slate-400 ml-2">/ {formatCurrency(category.budget)}</span>
                      </div>
                    </div>
                    <Progress 
                      value={(category.actual / category.budget) * 100} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>{formatPercentage(category.actual, category.budget)} of budget used</span>
                      <span className={category.variance > 0 ? "text-red-400" : "text-green-400"}>
                        {category.variance > 0 ? "+" : ""}{category.variance.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )) || (
                  <p className="text-slate-400 text-center py-8">No budget data available</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Variance Analysis Section */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={varianceDateRange.startDate}
                    onChange={(e) => setVarianceDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={varianceDateRange.endDate}
                    onChange={(e) => setVarianceDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    data-testid="input-end-date"
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={() => generateReportMutation.mutate()}
                    disabled={generateReportMutation.isPending}
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${generateReportMutation.isPending ? 'animate-spin' : ''}`} />
                    Generate Report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {varianceSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="text-sm font-medium">Total Variance Cost</p>
                      <p className="text-2xl font-bold text-red-600">
                        ${varianceSummary.totalVarianceCost.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-sm font-medium">Critical Variances</p>
                      <p className="text-2xl font-bold text-red-500">
                        {varianceSummary.criticalVariances}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">High Variances</p>
                      <p className="text-2xl font-bold text-yellow-500">
                        {varianceSummary.highVariances}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">Items Analyzed</p>
                      <p className="text-2xl font-bold text-blue-500">
                        {varianceSummary.totalAnalyzedItems}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="inventory" className="w-full">
            <TabsList>
              <TabsTrigger value="inventory">Inventory Variance</TabsTrigger>
              <TabsTrigger value="production">Production Variance</TabsTrigger>
              <TabsTrigger value="record">Record Production</TabsTrigger>
            </TabsList>

            {/* Inventory Variance Tab */}
            <TabsContent value="inventory">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Inventory Usage Variance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isVarianceLoading ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 bg-accent rounded animate-pulse" />
                      ))}
                    </div>
                  ) : varianceReport.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No variance data available for the selected period
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {varianceReport.map((item) => (
                        <div key={item.itemId} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getCategoryIcon(item.category)}
                              <div>
                                <h3 className="font-medium">{item.itemName}</h3>
                                <div className="flex gap-4 text-sm text-muted-foreground">
                                  <span>Theoretical: {item.theoreticalUsage.toFixed(2)}</span>
                                  <span>Actual: {item.actualUsage.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <Badge className={getCategoryColor(item.category)}>
                                  {item.variancePercentage > 0 ? '+' : ''}{item.variancePercentage.toFixed(1)}%
                                </Badge>
                                <p className="text-sm mt-1">
                                  Cost Impact: <span className={item.varianceCost > 0 ? 'text-red-600' : 'text-green-600'}>
                                    ${Math.abs(item.varianceCost).toFixed(2)}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Usage Progress</span>
                              <span>{((item.actualUsage / item.theoreticalUsage) * 100).toFixed(0)}%</span>
                            </div>
                            <Progress 
                              value={Math.min((item.actualUsage / item.theoreticalUsage) * 100, 100)}
                              className="h-2"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Production Variance Tab */}
            <TabsContent value="production">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ChefHat className="h-5 w-5" />
                    Recipe Production Variance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {productionVariance.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No production data available for the selected period
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {productionVariance.map((recipe) => (
                        <div key={recipe.recipeId} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium">{recipe.recipeName}</h3>
                              <p className="text-sm text-muted-foreground">
                                Produced: {recipe.quantityProduced} servings
                              </p>
                            </div>
                            
                            <div className="text-right">
                              <div className="flex gap-4 text-sm">
                                <span>Theoretical: ${recipe.theoreticalCost.toFixed(2)}</span>
                                <span>Actual: ${recipe.actualCost.toFixed(2)}</span>
                              </div>
                              <Badge className={recipe.variancePercentage > 5 ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-green-900/30 text-green-400 border border-green-800'}>
                                {recipe.variancePercentage > 0 ? '+' : ''}{recipe.variancePercentage.toFixed(1)}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Record Production Tab */}
            <TabsContent value="record">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ChefHat className="h-5 w-5" />
                    Record Recipe Production
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Recipe</Label>
                      <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
                        <SelectTrigger data-testid="select-recipe">
                          <SelectValue placeholder="Select recipe" />
                        </SelectTrigger>
                        <SelectContent>
                          {recipes.map((recipe: any) => (
                            <SelectItem key={recipe.id} value={recipe.id}>
                              {recipe.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Quantity Produced</Label>
                      <Input
                        type="number"
                        min="1"
                        step="0.1"
                        value={productionQuantity}
                        onChange={(e) => setProductionQuantity(e.target.value)}
                        placeholder="Servings produced"
                        data-testid="input-production-quantity"
                      />
                    </div>
                    
                    <div className="flex items-end">
                      <Button
                        onClick={() => recordProductionMutation.mutate({
                          recipeId: selectedRecipe,
                          quantity: parseFloat(productionQuantity)
                        })}
                        disabled={!selectedRecipe || !productionQuantity || recordProductionMutation.isPending}
                        className="w-full"
                        data-testid="button-record-production"
                      >
                        {recordProductionMutation.isPending ? 'Recording...' : 'Record Production'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}