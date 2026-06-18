import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "@/contexts/LocationContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Settings, 
  Plus, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Link2, 
  DollarSign,
  Activity,
  AlertTriangle,
  CreditCard,
  Trash2,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface PosIntegration {
  id: string;
  locationId: string;
  provider: string;
  name: string;
  merchantId: string;
  credentials: any;
  environment: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface PosSale {
  id: string;
  posOrderId: string;
  total: string;
  subtotal?: string;
  tax?: string;
  tip?: string;
  orderDate: string;
  inventoryProcessed: boolean;
  items?: Array<{
    itemName: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}

interface UnmappedMenuItem {
  id: string;
  posItemId: string;
  posIntegrationId: string;
  recipeId: string | null;
  name: string;
  category: string | null;
  price: string | null;
  sku: string | null;
  integration: {
    id: string;
    provider: string;
    name: string;
  };
}

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sellingPrice: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  categoryId: string | null;
}

interface PosEmployee {
  id: string;
  posIntegrationId: string;
  posEmployeeId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roleTitle: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  mapping?: {
    employeeId: string;
    status: string;
  };
}

function EmployeeSection({ integration }: { integration: PosIntegration }) {
  const { toast } = useToast();
  
  // Fetch employees for this integration
  const { data: employees = [], isLoading, refetch } = useQuery<PosEmployee[]>({
    queryKey: ["/api/pos-employees", integration.id],
    queryFn: async () => {
      const response = await fetch(`/api/pos-employees/${integration.id}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch employees');
      }
      return response.json();
    }
  });

  // Sync employees mutation
  const syncEmployeesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/pos-employees/sync/${integration.id}`, {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Employees synced",
        description: `Successfully synced ${data.syncedCount} employees from ${integration.provider}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos-employees", integration.id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sync shifts mutation
  const syncShiftsMutation = useMutation({
    mutationFn: async () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 7); // Last 7 days
      
      return apiRequest("POST", `/api/pos-employees/sync-shifts/${integration.id}`, {
        startDate: startDate.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      });
    },
    onSuccess: (data: any) => {
      const count = Number(data.syncedCount) || 0;
      toast({
        title: "Shifts synced",
        description: `Successfully synced ${count} shifts from ${integration.provider}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hr/time-entries"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{integration.name}</h3>
          <p className="text-sm text-muted-foreground capitalize">{integration.provider} POS</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => syncEmployeesMutation.mutate()}
            disabled={syncEmployeesMutation.isPending}
            data-testid="button-sync-employees"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncEmployeesMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Employees
          </Button>
          <Button
            onClick={() => syncShiftsMutation.mutate()}
            disabled={syncShiftsMutation.isPending}
            variant="outline"
            data-testid="button-sync-shifts"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncShiftsMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Shifts (Last 7 Days)
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading employees...</div>
      ) : employees.length === 0 ? (
        <Alert>
          <AlertDescription>
            No employees found. Click "Sync Employees" to import employees from {integration.provider}.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-2">
          {/* Only show employees that are NOT synced to HR */}
          {employees.filter(emp => !emp.mapping).length === 0 ? (
            <Alert>
              <AlertDescription>
                All {employees.length} employees have been synced to the HR system.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <h4 className="text-sm font-semibold">
                {employees.filter(emp => !emp.mapping).length} Unsynced Employees 
                ({employees.filter(emp => emp.mapping).length} synced to HR)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {employees.filter(emp => !emp.mapping).map((employee) => (
                  <div
                    key={employee.id}
                    className="border rounded-lg p-3 space-y-2"
                    data-testid={`employee-card-${employee.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold">{employee.displayName}</p>
                        {employee.email && (
                          <p className="text-sm text-muted-foreground">{employee.email}</p>
                        )}
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {employee.roleTitle && (
                            <Badge variant="outline">
                              {employee.roleTitle}
                            </Badge>
                          )}
                          {employee.mapping && (
                            <Badge variant="default" className="bg-blue-500">
                              ✓ Synced to HR
                            </Badge>
                          )}
                        </div>
                      </div>
                      {employee.isActive ? (
                        <Badge variant="default" className="bg-green-500">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    {employee.lastSeenAt && (
                      <p className="text-xs text-muted-foreground">
                        Last seen: {new Date(employee.lastSeenAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function PosIntegrationTab() {
  const { toast } = useToast();
  const { currentLocation: selectedLocation } = useLocation();
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set());
  const [newIntegration, setNewIntegration] = useState({
    provider: "spoton" as "spoton" | "clover" | "toast" | "revel",
    name: "",
    merchantId: "",
    credentials: {
      accessToken: "",
      apiKey: "",
    },
    environment: "sandbox" as "sandbox" | "production",
  });

  // Fetch integrations for current location
  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<PosIntegration[]>({
    queryKey: ["/api/pos/integrations", selectedLocation?.id],
    enabled: !!selectedLocation?.id,
  });

  // Fetch recent sales data
  const { data: sales = [], isLoading: salesLoading } = useQuery<PosSale[]>({
    queryKey: ["/api/pos/sales", selectedLocation?.id],
    enabled: !!selectedLocation?.id,
  });

  // Fetch webhook status
  const { data: webhookStatus = [], isLoading: webhookStatusLoading } = useQuery<PosIntegration[]>({
    queryKey: ["/api/pos/webhook-status"],
  });

  // Fetch unmapped menu items
  const { data: unmappedItems = [], isLoading: unmappedLoading } = useQuery<UnmappedMenuItem[]>({
    queryKey: ["/api/pos/menu-items/unmapped", selectedLocation?.id],
    enabled: !!selectedLocation?.id,
  });

  // Fetch recipes for the current location
  const { data: recipes = [] } = useQuery<Recipe[]>({
    queryKey: ["/api/recipes", selectedLocation?.id],
    enabled: !!selectedLocation?.id,
  });

  // Fetch inventory items for the current location
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", selectedLocation?.id],
    enabled: !!selectedLocation?.id,
  });

  // State to track mapping type for each menu item
  const [mappingTypes, setMappingTypes] = useState<Record<string, 'recipe' | 'inventory'>>({});

  // Create integration mutation
  const createIntegrationMutation = useMutation({
    mutationFn: async (data: typeof newIntegration) => {
      const response = await fetch("/api/pos/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: data.provider,
          name: data.name,
          merchantId: data.merchantId,
          credentials: data.credentials,
          environment: data.environment,
          locationId: selectedLocation?.id,
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "POS integration created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/integrations"] });
      setNewIntegration({
        provider: "spoton",
        name: "",
        merchantId: "",
        credentials: {
          accessToken: "",
          apiKey: "",
        },
        environment: "sandbox",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create POS integration",
        variant: "destructive",
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const response = await fetch(`/api/pos/integrations/${integrationId}/test`);
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: data.success ? "Connection Successful" : "Connection Failed",
        description: data.success 
          ? "Successfully connected to POS API" 
          : "Failed to connect to POS API. Check your credentials.",
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  // Sync menu items mutation
  const syncMenuItemsMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const response = await fetch(`/api/pos/integrations/${integrationId}/sync`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sync menu items");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sync Complete",
        description: "Menu items synced successfully from POS",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/integrations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync menu items from POS",
        variant: "destructive",
      });
    },
  });

  // Sync sales data mutation
  const syncSalesMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const response = await fetch(`/api/pos/integrations/${integrationId}/sync-sales`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sync sales");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sales Synced",
        description: `Successfully synced ${data.count} sales from POS`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/sales"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync sales data from POS",
        variant: "destructive",
      });
    },
  });

  // Toggle integration status
  const toggleIntegrationMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await fetch(`/api/pos/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Integration status updated",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/integrations"] });
    },
  });

  // Delete integration mutation
  const deleteIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pos/integrations/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Integration Deleted",
        description: "POS integration removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/integrations"] });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete POS integration",
        variant: "destructive",
      });
    },
  });

  // Link menu item to recipe or inventory item mutation
  const linkRecipeMutation = useMutation({
    mutationFn: async ({ menuItemId, recipeId, inventoryItemId }: { 
      menuItemId: string; 
      recipeId?: string | null;
      inventoryItemId?: string | null;
    }) => {
      const response = await fetch(`/api/pos/menu-items/${menuItemId}/recipe`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipeId || null, inventoryItemId: inventoryItemId || null }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to link item");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.recipeId ? "Recipe Linked" : "Inventory Item Linked",
        description: variables.recipeId 
          ? "Menu item successfully linked to recipe" 
          : "Menu item successfully linked to inventory item",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/menu-items/unmapped"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Link Failed",
        description: error.message || "Failed to link menu item to recipe",
        variant: "destructive",
      });
    },
  });

  // Delete menu item mutation
  const deleteMenuItemMutation = useMutation({
    mutationFn: async (menuItemId: string) => {
      await apiRequest("DELETE", `/api/pos/menu-items/${menuItemId}`);
    },
    onSuccess: () => {
      toast({
        title: "Item Deleted",
        description: "POS menu item removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/menu-items/unmapped"] });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete menu item",
        variant: "destructive",
      });
    },
  });

  if (!selectedLocation) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please select a location to manage POS integrations.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">POS Integration</h1>
          <p className="text-muted-foreground">
            Connect your POS systems (SpotOn, Clover, Toast, Revel) for automatic inventory deduction
          </p>
        </div>
      </div>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="mapping">Recipe Mapping</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="sales">Recent Sales</TabsTrigger>
          <TabsTrigger value="setup">Setup Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          {/* Create New Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Integration
              </CardTitle>
              <CardDescription>
                Connect a new POS system to start syncing sales and inventory data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">POS Provider</Label>
                  <Select
                    value={newIntegration.provider}
                    onValueChange={(value: "spoton" | "clover" | "toast" | "revel") =>
                      setNewIntegration({ ...newIntegration, provider: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spoton">SpotOn POS</SelectItem>
                      <SelectItem value="clover">Clover POS</SelectItem>
                      <SelectItem value="toast">Toast POS</SelectItem>
                      <SelectItem value="revel">Revel POS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Integration Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Bar Location - SpotOn"
                    value={newIntegration.name}
                    onChange={(e) =>
                      setNewIntegration({ ...newIntegration, name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="merchantId">
                    {newIntegration.provider === "spoton" ? "Location ID" : "Merchant ID"}
                  </Label>
                  <Input
                    id="merchantId"
                    placeholder={
                      newIntegration.provider === "spoton" 
                        ? "Enter your SpotOn Location ID" 
                        : "Enter your POS Merchant ID"
                    }
                    value={newIntegration.merchantId}
                    onChange={(e) =>
                      setNewIntegration({ ...newIntegration, merchantId: e.target.value })
                    }
                    data-testid="input-merchantid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="environment">Environment</Label>
                  <Select
                    value={newIntegration.environment}
                    onValueChange={(value: "sandbox" | "production") =>
                      setNewIntegration({ ...newIntegration, environment: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                      <SelectItem value="production">Production (Live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newIntegration.provider === "spoton" ? (
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Textarea
                    id="apiKey"
                    placeholder="Enter your SpotOn API Key"
                    value={newIntegration.credentials.apiKey}
                    onChange={(e) =>
                      setNewIntegration({ 
                        ...newIntegration, 
                        credentials: { ...newIntegration.credentials, apiKey: e.target.value }
                      })
                    }
                    data-testid="input-apikey"
                  />
                  <p className="text-sm text-muted-foreground">
                    Find your SpotOn API Key in your SpotOn Dashboard under Settings → API
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="accessToken">Access Token</Label>
                  <Textarea
                    id="accessToken"
                    placeholder="Enter your POS API access token"
                    value={newIntegration.credentials.accessToken}
                    onChange={(e) =>
                      setNewIntegration({ 
                        ...newIntegration, 
                        credentials: { ...newIntegration.credentials, accessToken: e.target.value }
                      })
                    }
                    data-testid="input-accesstoken"
                  />
                </div>
              )}
              <Button
                onClick={() => createIntegrationMutation.mutate(newIntegration)}
                disabled={
                  !newIntegration.name ||
                  !newIntegration.merchantId ||
                  (newIntegration.provider === "spoton" ? !newIntegration.credentials.apiKey : !newIntegration.credentials.accessToken) ||
                  createIntegrationMutation.isPending
                }
                data-testid="button-create-integration"
              >
                {createIntegrationMutation.isPending ? "Creating..." : "Create Integration"}
              </Button>
            </CardContent>
          </Card>

          {/* Existing Integrations */}
          <div className="grid gap-4">
            {integrationsLoading ? (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading integrations...</span>
                  </div>
                </CardContent>
              </Card>
            ) : integrations.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Integrations Found</h3>
                  <p className="text-muted-foreground">
                    Create your first POS integration to start syncing sales data.
                  </p>
                </CardContent>
              </Card>
            ) : (
              integrations.map((integration: PosIntegration) => (
                <Card key={integration.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Link2 className="h-5 w-5" />
                          {integration.name} ({integration.provider.toUpperCase()})
                        </CardTitle>
                        <CardDescription>
                          Merchant ID: {integration.merchantId} | Environment: {integration.environment}
                          {integration.lastSyncAt && (
                            <span className="ml-2">
                              • Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Badge variant={integration.isActive ? "default" : "secondary"}>
                        {integration.isActive ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 mr-1" />
                        )}
                        {integration.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnectionMutation.mutate(integration.id)}
                        disabled={testConnectionMutation.isPending}
                        data-testid="button-test-connection"
                      >
                        {testConnectionMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Activity className="h-4 w-4 mr-2" />
                        )}
                        Test Connection
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMenuItemsMutation.mutate(integration.id)}
                        disabled={syncMenuItemsMutation.isPending}
                        data-testid="button-sync-menu"
                      >
                        {syncMenuItemsMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sync Menu
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncSalesMutation.mutate(integration.id)}
                        disabled={syncSalesMutation.isPending}
                        data-testid="button-sync-sales"
                      >
                        {syncSalesMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <DollarSign className="h-4 w-4 mr-2" />
                        )}
                        Sync Sales
                      </Button>
                      <Button
                        variant={integration.isActive ? "destructive" : "default"}
                        size="sm"
                        onClick={() =>
                          toggleIntegrationMutation.mutate({
                            id: integration.id,
                            isActive: !integration.isActive,
                          })
                        }
                        disabled={toggleIntegrationMutation.isPending}
                        data-testid="button-toggle-integration"
                      >
                        {integration.isActive ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete "${integration.name}"?`)) {
                            deleteIntegrationMutation.mutate(integration.id);
                          }
                        }}
                        disabled={deleteIntegrationMutation.isPending}
                        data-testid="button-delete-integration"
                      >
                        {deleteIntegrationMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Recipe Mapping
              </CardTitle>
              <CardDescription>
                Link POS menu items to recipes for automatic inventory deduction and cost tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmappedLoading ? (
                <div className="flex items-center justify-center p-6">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading unmapped items...</span>
                </div>
              ) : unmappedItems.length === 0 ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    All menu items are mapped! When a sale occurs, inventory will be automatically deducted (recipes deduct ingredients, direct items deduct 1 unit).
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {unmappedItems.length} menu items need to be linked. Choose "Recipe" for cocktails/prepared food or "Inventory Item" for beer/bottles. Unmapped items won't trigger inventory deductions when sold.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-4">
                    {unmappedItems.map((item) => (
                      <Card key={item.id}>
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold text-lg">{item.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline">{item.integration.provider}</Badge>
                                  {item.category && <Badge variant="secondary">{item.category}</Badge>}
                                  {item.price && <span className="text-sm text-muted-foreground">${item.price}</span>}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                                    deleteMenuItemMutation.mutate(item.id);
                                  }
                                }}
                                disabled={deleteMenuItemMutation.isPending}
                                data-testid={`button-delete-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label>Link Type</Label>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant={mappingTypes[item.id] !== 'inventory' ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setMappingTypes(prev => ({ ...prev, [item.id]: 'recipe' }))}
                                    data-testid={`button-recipe-type-${item.id}`}
                                  >
                                    Recipe (Cocktails/Food)
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={mappingTypes[item.id] === 'inventory' ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setMappingTypes(prev => ({ ...prev, [item.id]: 'inventory' }))}
                                    data-testid={`button-inventory-type-${item.id}`}
                                  >
                                    Inventory Item (Beer/Bottles)
                                  </Button>
                                </div>
                              </div>

                              {mappingTypes[item.id] === 'inventory' ? (
                                <div className="space-y-2">
                                  <Label htmlFor={`inventory-${item.id}`}>Link to Inventory Item</Label>
                                  <Select
                                    onValueChange={(value) => {
                                      if (value === "none") {
                                        linkRecipeMutation.mutate({ menuItemId: item.id, inventoryItemId: null });
                                      } else {
                                        linkRecipeMutation.mutate({ menuItemId: item.id, inventoryItemId: value });
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="flex-1" id={`inventory-${item.id}`} data-testid={`select-inventory-${item.id}`}>
                                      <SelectValue placeholder="Select an inventory item..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Item</SelectItem>
                                      {inventoryItems
                                        .filter((i) => i.name.toLowerCase().includes(item.name.toLowerCase()) || 
                                                       item.name.toLowerCase().includes(i.name.toLowerCase()))
                                        .slice(0, 5)
                                        .map((invItem) => (
                                          <SelectItem key={invItem.id} value={invItem.id}>
                                            {invItem.name}
                                          </SelectItem>
                                        ))}
                                      {inventoryItems.length > 5 && (
                                        <>
                                          <SelectItem value="divider" disabled>
                                            ──── All Items ────
                                          </SelectItem>
                                          {inventoryItems
                                            .filter((i) => !i.name.toLowerCase().includes(item.name.toLowerCase()) && 
                                                         !item.name.toLowerCase().includes(i.name.toLowerCase()))
                                            .map((invItem) => (
                                              <SelectItem key={invItem.id} value={invItem.id}>
                                                {invItem.name}
                                              </SelectItem>
                                            ))}
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    For beer/bottled drinks. Deducts 1 unit from inventory when sold.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Label htmlFor={`recipe-${item.id}`}>Link to Recipe</Label>
                                  <Select
                                    onValueChange={(value) => {
                                      if (value === "none") {
                                        linkRecipeMutation.mutate({ menuItemId: item.id, recipeId: null });
                                      } else {
                                        linkRecipeMutation.mutate({ menuItemId: item.id, recipeId: value });
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="flex-1" id={`recipe-${item.id}`} data-testid={`select-recipe-${item.id}`}>
                                      <SelectValue placeholder="Select a recipe..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Recipe</SelectItem>
                                      {recipes
                                        .filter((r) => r.name.toLowerCase().includes(item.name.toLowerCase()) || 
                                                       item.name.toLowerCase().includes(r.name.toLowerCase()))
                                        .slice(0, 5)
                                        .map((recipe) => (
                                          <SelectItem key={recipe.id} value={recipe.id}>
                                            {recipe.name} ({recipe.category})
                                          </SelectItem>
                                        ))}
                                      {recipes.length > 5 && (
                                        <>
                                          <SelectItem value="divider" disabled>
                                            ──── All Recipes ────
                                          </SelectItem>
                                          {recipes
                                            .filter((r) => !r.name.toLowerCase().includes(item.name.toLowerCase()) && 
                                                         !item.name.toLowerCase().includes(r.name.toLowerCase()))
                                            .map((recipe) => (
                                              <SelectItem key={recipe.id} value={recipe.id}>
                                                {recipe.name} ({recipe.category})
                                              </SelectItem>
                                            ))}
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    For cocktails/prepared food. Deducts recipe ingredients from inventory when sold.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Webhook Configuration
              </CardTitle>
              <CardDescription>
                Configure webhook URLs in your POS system to enable real-time inventory sync
              </CardDescription>
            </CardHeader>
            <CardContent>
              {webhookStatusLoading ? (
                <div className="flex items-center justify-center p-6">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading webhook status...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {webhookStatus.map((webhook: any) => (
                    <div key={webhook.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{webhook.name}</h3>
                          <p className="text-sm text-muted-foreground capitalize">
                            {webhook.provider} Integration
                          </p>
                        </div>
                        <Badge variant={webhook.isActive ? "default" : "secondary"}>
                          {webhook.status}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <Label className="text-sm font-medium">Webhook URL</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input 
                              value={webhook.webhookUrl} 
                              readOnly 
                              className="bg-muted text-sm"
                            />
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(webhook.webhookUrl);
                                toast({
                                  title: "Copied!",
                                  description: "Webhook URL copied to clipboard",
                                });
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                        
                        {webhook.lastSyncAt && (
                          <div>
                            <Label className="text-sm font-medium">Last Webhook Received</Label>
                            <p className="text-sm text-muted-foreground mt-1">
                              {new Date(webhook.lastSyncAt).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {webhook.provider === 'clover' && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Clover Setup:</strong> In your Clover dashboard, configure webhooks for these events:
                            ORDER_CREATED, ORDER_UPDATED, PAYMENT_CREATED, INVENTORY_UPDATED
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                  
                  {webhookStatus.length === 0 && (
                    <div className="text-center p-6">
                      <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Webhook Integrations</h3>
                      <p className="text-muted-foreground">
                        Create a POS integration first to configure webhooks for real-time sync.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Recent Clover Sales
              </CardTitle>
              <CardDescription>
                Sales data automatically synced from your Clover POS system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <div className="flex items-center justify-center p-6">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Loading sales data...</span>
                </div>
              ) : sales.length === 0 ? (
                <div className="text-center p-6">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Sales Data</h3>
                  <p className="text-muted-foreground">
                    Sales will appear here once your Clover integration starts receiving webhook events.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sales.map((sale: PosSale) => {
                    const isExpanded = expandedSales.has(sale.id);
                    return (
                      <Card
                        key={sale.id}
                        className="border rounded-lg"
                        data-testid={`sale-${sale.id}`}
                      >
                        <CardContent className="p-4">
                          <Collapsible
                            open={isExpanded}
                            onOpenChange={() => {
                              const newExpanded = new Set(expandedSales);
                              if (isExpanded) {
                                newExpanded.delete(sale.id);
                              } else {
                                newExpanded.add(sale.id);
                              }
                              setExpandedSales(newExpanded);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-semibold" data-testid={`text-order-${sale.id}`}>
                                  Order #{sale.posOrderId}
                                </p>
                                <p className="text-sm text-muted-foreground" data-testid={`text-date-${sale.id}`}>
                                  {new Date(sale.orderDate).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={sale.inventoryProcessed ? "default" : "secondary"}>
                                  {sale.inventoryProcessed ? "Processed" : "Pending"}
                                </Badge>
                                <CollapsibleTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    data-testid={`button-expand-${sale.id}`}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                              </div>
                            </div>
                            
                            <CollapsibleContent>
                              <div className="space-y-3 pt-3 border-t mt-3">
                                {sale.items && sale.items.length > 0 && (
                                  <div>
                                    <p className="text-sm font-medium mb-2">Items:</p>
                                    <div className="space-y-1 pl-2">
                                      {sale.items.map((item, index) => (
                                        <div 
                                          key={index} 
                                          className="flex items-center justify-between text-sm"
                                          data-testid={`item-${sale.id}-${index}`}
                                        >
                                          <span className="text-muted-foreground">
                                            {item.quantity}x {item.itemName}
                                          </span>
                                          <span className="font-medium">${Number(item.totalPrice).toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="border-t pt-3">
                                  <div className="space-y-1">
                                    {sale.subtotal && (
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>${Number(sale.subtotal).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {sale.tax && (
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Tax</span>
                                        <span>${Number(sale.tax).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {sale.tip && (
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Tip</span>
                                        <span>${Number(sale.tip).toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between font-semibold pt-1 border-t">
                                      <span>Total</span>
                                      <span>${Number(sale.total).toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>

                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>POS Employees</CardTitle>
                  <CardDescription>
                    View and sync employees from your POS systems
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {integrations.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No integrations found. Please add a POS integration first to sync employees.
                  </AlertDescription>
                </Alert>
              ) : (
                integrations.map((integration) => (
                  <EmployeeSection key={integration.id} integration={integration} />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Clover Integration Setup Guide</CardTitle>
              <CardDescription>
                Follow these steps to connect your Clover POS system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold mb-2">Step 1: Get Your Merchant ID</h3>
                  <p className="text-sm text-muted-foreground">
                    Log in to your Clover dashboard and find your Merchant ID in the account settings.
                  </p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold mb-2">Step 2: Generate API Access Token</h3>
                  <p className="text-sm text-muted-foreground">
                    Create an API access token in your Clover developer dashboard with the following permissions:
                    orders:read, items:read, merchants:read
                  </p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold mb-2">Step 3: Configure Webhook</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Set up a webhook in your Clover app to send order events to:
                  </p>
                  <code className="bg-muted p-2 rounded text-sm block">
                    {window.location.origin}/api/clover/webhook
                  </code>
                  <p className="text-sm text-muted-foreground mt-2">
                    Subscribe to the "ORDER" event type to enable automatic inventory deduction.
                  </p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold mb-2">Step 4: Test Connection</h3>
                  <p className="text-sm text-muted-foreground">
                    After creating the integration, use the "Test Connection" button to verify everything is working correctly.
                  </p>
                </div>
                
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold mb-2">Step 5: Sync Menu Items</h3>
                  <p className="text-sm text-muted-foreground">
                    Use the "Sync Menu Items" button to import your Clover menu items, then map them to your inventory items for automatic deduction.
                  </p>
                </div>
              </div>
              
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important:</strong> Start with the sandbox environment for testing. Only switch to production after thorough testing.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}