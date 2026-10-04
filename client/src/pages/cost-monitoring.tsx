import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  DollarSign, 
  Target,
  Bell,
  Activity,
  BarChart3
} from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function CostMonitoring() {
  const [timeRange, setTimeRange] = useState("30d");
  const [locationFilter, setLocationFilter] = useState("all");

  // Queries
  const { data: costAlerts = [] } = useQuery({
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Cost Monitoring</h1>
          <p className="text-slate-300 mt-2">Real-time cost tracking and automated alerts</p>
        </div>
        <div className="flex gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32 bg-slate-700 border-slate-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-48 bg-slate-700 border-slate-600">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((location: any) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
                  {budgetTracking?.spendVariance > 0 ? (
                    <TrendingUp className="h-3 w-3 text-red-400 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-green-400 mr-1" />
                  )}
                  <span className={budgetTracking?.spendVariance > 0 ? "text-red-400" : "text-green-400"}>
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
                <p className="text-2xl font-bold text-white">{costAlerts.length}</p>
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
              {costAlerts.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No active alerts</p>
              ) : (
                costAlerts.slice(0, 5).map((alert: any) => (
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
    </div>
  );
}
