import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, Package, TrendingUp, AlertTriangle, DollarSign, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useLocation } from "@/contexts/LocationContext";
import { apiRequest } from "@/lib/queryClient";
import InventoryTable from "@/components/inventory/inventory-table";
import AddItemDialog from "@/components/inventory/add-item-dialog";
import CsvImportDialog from "@/components/inventory/csv-import-dialog";
import LocationBanner from "@/components/location/location-banner";
import QuickAddWidget from "@/components/inventory/quick-add-widget";

export default function Inventory() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCsvImportDialogOpen, setIsCsvImportDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentLocation } = useLocation();

  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['/api/inventory', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['/api/categories', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['/api/vendors', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const { data: lowStockItems = [] } = useQuery({
    queryKey: ['/api/inventory/low-stock', currentLocation?.id],
    enabled: !!currentLocation,
  });

  // Filter items based on search and category
  const filteredItems = (inventoryItems as any[])?.filter((item: any) => {
    const matchesSearch = item.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || categoryFilter === 'all' || item.categoryId === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleAddSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/inventory', currentLocation?.id] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
    queryClient.invalidateQueries({ queryKey: ['/api/inventory/low-stock', currentLocation?.id] });
    setIsAddDialogOpen(false);
    toast({
      title: "Success",
      description: "Inventory item added successfully",
    });
  };

  const handleEditSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/inventory', currentLocation?.id] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
    queryClient.invalidateQueries({ queryKey: ['/api/inventory/low-stock', currentLocation?.id] });
    setEditingItem(null);
    toast({
      title: "Success",
      description: "Inventory item updated successfully",
    });
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
  };

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest('DELETE', `/api/inventory/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory', currentLocation?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/low-stock', currentLocation?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      setEditingItem(null);
      toast({
        title: "Success",
        description: "Item deleted successfully",
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
        description: "Failed to delete item",
        variant: "destructive",
      });
    },
  });

  const handleDeleteFromDialog = (item: any) => {
    deleteItemMutation.mutate(item.id);
  };

  // Calculate inventory metrics
  const totalItems = (inventoryItems as any[])?.length || 0;
  const totalValue = (inventoryItems as any[])?.reduce((sum: number, item: any) => {
    return sum + (parseFloat(item.quantity) * parseFloat(item.costPerUnit));
  }, 0) || 0;
  const lowStockCount = (lowStockItems as any[])?.length || 0;
  const averageValue = totalItems > 0 ? totalValue / totalItems : 0;

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6 bg-slate-950 min-h-screen">
      {/* Location Banner */}
      <LocationBanner />
      
      {/* Page Header - Mobile optimized */}
      <div className="flex flex-col space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl lg:text-3xl font-bold text-white">Inventory</h1>
            <p className="text-xs lg:text-sm text-slate-400 mt-1">
              {currentLocation ? currentLocation.name : 'Select location'}
            </p>
          </div>
          {/* Mobile: Primary add button */}
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            size="sm"
            className="lg:hidden bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg"
            disabled={!currentLocation}
            data-testid="button-add-item-mobile"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Desktop: Action buttons */}
        <div className="hidden lg:flex flex-wrap gap-2">
          <Button 
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
            disabled={!currentLocation}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button 
            onClick={() => setIsCsvImportDialogOpen(true)}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
            disabled={!currentLocation}
            data-testid="button-import"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={!currentLocation}
            data-testid="button-add-item"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
        
        {/* Mobile: Quick action buttons */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <Button 
            onClick={() => setIsCsvImportDialogOpen(true)}
            size="sm"
            variant="outline"
            className="flex-shrink-0 border-slate-600 text-slate-300 hover:bg-slate-800"
            disabled={!currentLocation}
            data-testid="button-import-mobile"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button 
            size="sm"
            variant="outline"
            className="flex-shrink-0 border-slate-600 text-slate-300 hover:bg-slate-800"
            disabled={!currentLocation}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Inventory Metrics */}
      {currentLocation && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Package className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Total Items</p>
                  <p className="text-2xl font-bold text-white">{totalItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Total Value</p>
                  <p className="text-2xl font-bold text-white">${totalValue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertTriangle className={`h-8 w-8 ${lowStockCount > 0 ? 'text-red-500' : 'text-slate-500'}`} />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Low Stock</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-white">{lowStockCount}</p>
                    {lowStockCount > 0 && (
                      <Badge variant="destructive" className="text-xs">Alert</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700">
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-purple-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-slate-400">Avg. Value</p>
                  <p className="text-2xl font-bold text-white">${averageValue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Filters and Search */}
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter & Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search inventory items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 focus:border-blue-500"
                    data-testid="input-search"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-56 bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    <SelectItem value="all">All Categories</SelectItem>
                    {(categories as any[])?.map((category: any) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Results Summary */}
              {currentLocation && (
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>
                    {filteredItems?.length || 0} of {totalItems} items
                    {searchTerm && ` matching "${searchTerm}"`}
                    {categoryFilter && categoryFilter !== 'all' && ` in selected category`}
                  </span>
                  {(searchTerm || (categoryFilter && categoryFilter !== 'all')) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm('');
                        setCategoryFilter('');
                      }}
                      className="text-slate-400 hover:text-white"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inventory Table */}
          <Card className="bg-slate-900/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Inventory Items
                </div>
                {filteredItems?.length > 0 && (
                  <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                    {filteredItems.length} items
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <InventoryTable 
                items={filteredItems} 
                isLoading={isLoading}
                showPagination={true}
                onEditItem={handleEditItem}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar with Quick Add Widget */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <QuickAddWidget />
          </div>
        </div>
      </div>

      {/* Add Item Dialog */}
      <AddItemDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={handleAddSuccess}
        categories={(categories as any[]) || []}
        vendors={(vendors as any[]) || []}
      />

      {/* Edit Item Dialog */}
      {editingItem && (
        <AddItemDialog
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={handleEditSuccess}
          categories={(categories as any[]) || []}
          vendors={(vendors as any[]) || []}
          editingItem={editingItem}
          onDelete={handleDeleteFromDialog}
        />
      )}

      {/* CSV Import Dialog */}
      {currentLocation && (
        <CsvImportDialog
          isOpen={isCsvImportDialogOpen}
          onClose={() => setIsCsvImportDialogOpen(false)}
          locationId={currentLocation.id}
        />
      )}
    </div>
  );
}
