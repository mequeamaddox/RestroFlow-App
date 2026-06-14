import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Trash2, Package2, MoreHorizontal, AlertCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useLocation } from "@/contexts/LocationContext";
import { type InventoryItem, type Category, type Vendor } from "@shared/schema";

interface InventoryTableProps {
  items?: (InventoryItem & { category?: Category; vendor?: Vendor })[];
  isLoading: boolean;
  showPagination?: boolean;
  maxItems?: number;
  onEditItem?: (item: InventoryItem) => void;
}

export default function InventoryTable({ items, isLoading, showPagination = false, maxItems, onEditItem }: InventoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const itemsPerPage = 10;
  const { toast } = useToast();
  const { currentLocation } = useLocation();
  const queryClient = useQueryClient();

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest('DELETE', `/api/inventory/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory', currentLocation?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/metrics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/low-stock', currentLocation?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      setDeleteItem(null);
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(displayItems.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems(prev => [...prev, itemId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== itemId));
    }
  };

  const handleDeleteItem = (item: InventoryItem) => {
    setDeleteItem(item);
  };

  const confirmDelete = () => {
    if (deleteItem) {
      deleteItemMutation.mutate(deleteItem.id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg animate-pulse">
            <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
            <div className="w-20 h-6 bg-gray-200 rounded"></div>
            <div className="w-16 h-6 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16">
        <Package2 className="h-16 w-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-xl font-medium text-white mb-2">No inventory items found</h3>
        <p className="text-slate-400 mb-4">Start by adding your first inventory item or try adjusting your filters.</p>
      </div>
    );
  }

  const getStatusBadge = (item: InventoryItem) => {
    const quantity = parseFloat(item.quantity);
    const reorderLevel = parseFloat(item.reorderLevel);
    
    if (quantity <= reorderLevel) {
      return <Badge variant="destructive">Low Stock</Badge>;
    } else if (quantity <= reorderLevel * 1.5) {
      return <Badge variant="secondary" className="bg-yellow-900/30 text-yellow-400 border border-yellow-800">Medium Stock</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-green-900/30 text-green-400 border border-green-800">In Stock</Badge>;
    }
  };

  const getCategoryIcon = (categoryName?: string) => {
    // Simple icon mapping based on category
    const iconMap: Record<string, string> = {
      'proteins': '🥩',
      'vegetables': '🥕',
      'dairy': '🧀',
      'beverages': '🥤',
      'dry goods': '🌾',
      'spices': '🌿',
    };
    return iconMap[categoryName?.toLowerCase() || ''] || '📦';
  };

  // Pagination logic
  let displayItems = items;
  let totalPages = 1;
  
  if (maxItems) {
    displayItems = items.slice(0, maxItems);
  } else if (showPagination) {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    displayItems = items.slice(startIndex, endIndex);
    totalPages = Math.ceil(items.length / itemsPerPage);
  }

  return (
    <>
      <div className="space-y-4">
        {/* Bulk Actions Bar */}
        {selectedItems.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-blue-950/50 border border-blue-800 rounded-lg">
            <span className="text-sm text-blue-300">
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedItems([])}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="bg-red-600 hover:bg-red-700"
              >
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedItems.length === displayItems.length && displayItems.length > 0}
                      onCheckedChange={handleSelectAll}
                      className="border-slate-500"
                    />
                  </TableHead>
                  <TableHead className="text-slate-300">Item</TableHead>
                  <TableHead className="text-slate-300">Category</TableHead>
                  <TableHead className="text-slate-300">Purchase Units</TableHead>
                  <TableHead className="text-slate-300">Recipe Units</TableHead>
                  <TableHead className="text-slate-300">Cost/Recipe Unit</TableHead>
                  <TableHead className="text-slate-300">Total Value</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-right text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item) => {
                  const totalValue = parseFloat(item.quantity) * parseFloat(item.costPerUnit);
                  const isSelected = selectedItems.includes(item.id);
                  
                  return (
                    <TableRow 
                      key={item.id} 
                      className={`border-slate-700 hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-blue-950/30 border-blue-800' : ''
                      }`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                          className="border-slate-500"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-lg">
                            {getCategoryIcon(item.category?.name)}
                          </div>
                          <div>
                            <div className="font-medium text-white">
                              {item.displayName || item.name}
                            </div>
                            {item.displayName && (
                              <div className="text-xs text-slate-500 mt-0.5">{item.name}</div>
                            )}
                            {item.description && (
                              <div className="text-sm text-slate-400 mt-1">{item.description}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {item.category?.name || 'Uncategorized'}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        <div>
                          <div className="font-medium">{item.quantity} {item.purchaseUnit || item.unit}</div>
                          {item.costPerPurchaseUnit && (
                            <div className="text-xs text-slate-400">
                              ${parseFloat(item.costPerPurchaseUnit).toFixed(2)}/{item.purchaseUnit}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        <div>
                          {item.conversionFactor && item.purchaseUnit && item.recipeUnit ? (
                            <>
                              <div className="font-medium">
                                {(parseFloat(item.quantity) * parseFloat(item.conversionFactor)).toFixed(1)} {item.recipeUnit}
                              </div>
                              <div className="text-xs text-slate-400">
                                1 {item.purchaseUnit} = {parseFloat(item.conversionFactor).toFixed(1)} {item.recipeUnit}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">Standard units</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">
                        {item.conversionFactor && item.costPerPurchaseUnit ? (
                          <div>
                            <div className="font-medium">
                              ${(parseFloat(item.costPerPurchaseUnit) / parseFloat(item.conversionFactor)).toFixed(2)}/{item.recipeUnit}
                            </div>
                            {item.servingsPerPurchaseUnit && (
                              <div className="text-xs text-slate-400">
                                ${(parseFloat(item.costPerPurchaseUnit) / parseInt(item.servingsPerPurchaseUnit.toString())).toFixed(2)}/serving
                              </div>
                            )}
                          </div>
                        ) : (
                          <span>${parseFloat(item.costPerUnit).toFixed(2)}/{item.unit}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        ${totalValue.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(item)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                              data-testid={`button-actions-${item.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                            <DropdownMenuItem 
                              onClick={() => onEditItem?.(item)}
                              className="text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteItem(item)}
                              className="text-red-400 hover:bg-red-950 hover:text-red-300 cursor-pointer"
                              data-testid={`button-delete-item-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
          </Table>
        </div>
      </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {displayItems.map((item) => {
            const totalValue = parseFloat(item.quantity) * parseFloat(item.costPerUnit);
            const isSelected = selectedItems.includes(item.id);
            
            return (
              <div 
                key={item.id} 
                className={`bg-slate-900/50 border rounded-lg p-4 space-y-3 transition-colors ${
                  isSelected ? 'border-blue-500 bg-blue-950/20' : 'border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                      className="border-slate-500"
                    />
                    <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-lg">
                      {getCategoryIcon(item.category?.name)}
                    </div>
                    <div>
                      <div className="font-medium text-white">{item.displayName || item.name}</div>
                      <div className="text-sm text-slate-400">{item.category?.name || 'Uncategorized'}</div>
                      {item.displayName && (
                        <div className="text-xs text-slate-500 mt-0.5">{item.name}</div>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(item)}
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Quantity:</span>
                    <div className="font-medium text-white">{item.quantity} {item.unit}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Unit Cost:</span>
                    <div className="font-medium text-white">${parseFloat(item.costPerUnit).toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Value:</span>
                    <div className="font-medium text-white">${totalValue.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Vendor:</span>
                    <div className="font-medium text-white">{item.vendor?.name || 'N/A'}</div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-600">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onEditItem?.(item)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDeleteItem(item)}
                    className="border-red-600 text-red-400 hover:bg-red-950 hover:text-red-300"
                    data-testid={`button-delete-item-mobile-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {showPagination && totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <div className="text-sm text-slate-300">
              Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-medium">{Math.min(currentPage * itemsPerPage, items.length)}</span> of{' '}
              <span className="font-medium">{items.length}</span> items
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Previous
              </Button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                const page = i + 1;
                return (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={currentPage === page ? "bg-blue-600 hover:bg-blue-700" : "border-slate-600 text-slate-300 hover:bg-slate-800"}
                  >
                    {page}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Delete Inventory Item
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{deleteItem?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={deleteItemMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteItemMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
