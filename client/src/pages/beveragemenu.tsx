import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Martini, DollarSign, Trash2, Eye, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "@/contexts/LocationContext";
import { BarUpgradePrompt } from "@/components/bar/bar-upgrade-prompt";
import { computeLineCost } from "@/lib/unitCost";
import { z } from "zod";
import { Link } from "wouter";

const menuItemFormSchema = z.object({
  name: z.string().min(1, "Drink name is required"),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  price: z.number().min(0, "Price must be 0 or more")
});

type MenuItemFormData = z.infer<typeof menuItemFormSchema>;

export default function BeverageMenu() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<any>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState([{ inventoryItemId: '', quantity: 0, unit: 'oz' }]);
  const [targetCostPct, setTargetCostPct] = useState(20); // 20% default pour cost
  const { toast } = useToast();
  const { currentLocation, hasBarAccess } = useLocation();
  const queryClient = useQueryClient();

  const { data: menuItems = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/menu-items', currentLocation?.id],
    queryFn: () => apiRequest('GET', `/api/menu-items?locationId=${currentLocation?.id}`).then(r => r.json()),
    enabled: !!currentLocation,
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory', currentLocation?.id],
    queryFn: () => apiRequest('GET', `/api/inventory?locationId=${currentLocation?.id}`).then(r => r.json()),
    enabled: !!currentLocation,
  });

  const form = useForm<MenuItemFormData>({
    resolver: zodResolver(menuItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      price: 0
    },
  });

  const createMenuItemMutation = useMutation({
    mutationFn: async (data: MenuItemFormData) => {
      const validIngredients = ingredients.filter(ing => ing.inventoryItemId && ing.quantity > 0);
      if (validIngredients.length === 0) {
        throw new Error('At least one ingredient is required');
      }
      
      if (editingMenuItemId) {
        await apiRequest('PUT', `/api/menu-items/${editingMenuItemId}`, {
          ...data,
          price: data.price.toString(),
          locationId: currentLocation?.id,
          ingredients: validIngredients
        });
      } else {
        await apiRequest('POST', '/api/menu-items', {
          ...data,
          price: data.price.toString(),
          locationId: currentLocation?.id,
          ingredients: validIngredients
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/menu-items', currentLocation?.id] });
      setIsCreateDialogOpen(false);
      form.reset();
      setIngredients([{ inventoryItemId: '', quantity: 0, unit: 'oz' }]);
      setTargetCostPct(20);
      setEditingMenuItemId(null);
      toast({
        title: "Success",
        description: editingMenuItemId ? "Drink updated successfully" : "Drink created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save drink",
        variant: "destructive",
      });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/menu-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/menu-items', currentLocation?.id] });
      toast({
        title: "Success",
        description: "Drink deleted successfully",
      });
    },
  });

  const filteredMenuItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (menuItem: any) => {
    setEditingMenuItemId(menuItem.id);
    form.reset({
      name: menuItem.name,
      description: menuItem.description || "",
      category: menuItem.category,
      price: parseFloat(menuItem.price)
    });
    setIngredients(menuItem.ingredients?.length > 0 
      ? menuItem.ingredients.map((ing: any) => ({
          inventoryItemId: ing.inventoryItemId,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit
        }))
      : [{ inventoryItemId: '', quantity: 0, unit: 'oz' }]
    );
    setIsCreateDialogOpen(true);
  };

  const handleViewDetails = async (menuItem: any) => {
    const response = await apiRequest('GET', `/api/menu-items/${menuItem.id}`);
    const fullMenuItem = await response.json();
    setSelectedMenuItem(fullMenuItem);
    setIsDetailsDialogOpen(true);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { inventoryItemId: '', quantity: 0, unit: 'oz' }]);
  };

  const updateIngredient = (index: number, field: string, value: any) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = { ...newIngredients[index], [field]: value };
    setIngredients(newIngredients);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const calculateDrinkCost = () => {
    let totalCost = 0;
    ingredients.forEach(ing => {
      if (ing.inventoryItemId && ing.quantity > 0) {
        const item = inventoryItems.find((inv: any) => inv.id === ing.inventoryItemId);
        if (item) {
          totalCost += computeLineCost(item, Number(ing.quantity), String(ing.unit));
        }
      }
    });
    return totalCost;
  };

  const drinkCost = calculateDrinkCost();
  const suggestedPrice = drinkCost > 0 ? drinkCost / (targetCostPct / 100) : 0;

  const onSubmit = (data: MenuItemFormData) => {
    createMenuItemMutation.mutate(data);
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'cocktail': 'bg-purple-500/20 text-purple-300',
      'beer': 'bg-amber-500/20 text-amber-300',
      'wine': 'bg-red-500/20 text-red-300',
      'spirit': 'bg-orange-500/20 text-orange-300',
      'non-alcoholic': 'bg-green-500/20 text-green-300'
    };
    return colors[category.toLowerCase()] || 'bg-slate-500/20 text-slate-300';
  };

  if (!hasBarAccess) return <BarUpgradePrompt locationName={currentLocation?.name || "this location"} />;

  return (
    <div className="p-3 lg:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-3xl font-bold text-white flex items-center gap-2">
            <Martini className="h-6 w-6 lg:h-8 lg:w-8" />
            Beverage Menu
          </h1>
          <p className="text-xs lg:text-sm text-slate-400 mt-1">
            Manage cocktails, mixed drinks, and bar menu items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/beveragecost">
            <Button variant="outline" className="bg-slate-800 border-slate-600 text-white hover:bg-slate-700">
              <Calculator className="h-4 w-4 mr-2" />
              Pricing Calculator
            </Button>
          </Link>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
            <Button 
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              onClick={() => {
                setEditingMenuItemId(null);
                form.reset();
                setIngredients([{ inventoryItemId: '', quantity: 0, unit: 'oz' }]);
              }}
              data-testid="button-add-drink"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Drink
            </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingMenuItemId ? 'Edit Drink' : 'Create New Drink'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drink Name</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-slate-800 border-slate-600" data-testid="input-drink-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} className="bg-slate-800 border-slate-600" rows={2} data-testid="input-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-800 border-slate-600" data-testid="select-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="cocktail">Cocktail</SelectItem>
                          <SelectItem value="beer">Beer</SelectItem>
                          <SelectItem value="wine">Wine</SelectItem>
                          <SelectItem value="spirit">Spirit</SelectItem>
                          <SelectItem value="non-alcoholic">Non-Alcoholic</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Ingredients</label>
                    <Button type="button" variant="outline" size="sm" onClick={addIngredient} data-testid="button-add-ingredient">
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                  {ingredients.map((ing, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Select
                        value={ing.inventoryItemId}
                        onValueChange={(value) => updateIngredient(index, 'inventoryItemId', value)}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-600 flex-1" data-testid={`select-ingredient-${index}`}>
                          <SelectValue placeholder="Select ingredient" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 max-h-72">
                          {inventoryItems.map((item: any) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.displayName || item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        step="0.25"
                        placeholder="Qty"
                        value={ing.quantity || ''}
                        onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
                        className="bg-slate-800 border-slate-600 w-24"
                        data-testid={`input-quantity-${index}`}
                      />
                      <Input
                        placeholder="Unit"
                        value={ing.unit}
                        onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                        className="bg-slate-800 border-slate-600 w-20"
                        data-testid={`input-unit-${index}`}
                      />
                      {ingredients.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeIngredient(index)}
                          data-testid={`button-remove-ingredient-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-800/50 rounded-lg">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Cost Per Drink</label>
                    <div className="text-lg font-bold text-green-400">${drinkCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Target Cost %</label>
                    <Input
                      type="number"
                      value={targetCostPct}
                      onChange={(e) => setTargetCostPct(parseFloat(e.target.value) || 20)}
                      className="bg-slate-700 border-slate-600 h-8"
                      data-testid="input-target-cost"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 block mb-1">
                      Suggested Price (at {targetCostPct}% cost)
                    </label>
                    <div className="text-lg font-bold text-blue-400">${suggestedPrice.toFixed(2)}</div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => {
                    const sellingPrice = parseFloat(field.value?.toString() || '0');
                    const actualCostPct = sellingPrice > 0 ? (drinkCost / sellingPrice) * 100 : 0;
                    const profitMargin = sellingPrice - drinkCost;
                    
                    // Determine feedback color and message
                    let feedbackColor = 'text-slate-400';
                    let feedbackMessage = '';
                    
                    if (sellingPrice > 0) {
                      if (actualCostPct <= 20) {
                        feedbackColor = 'text-green-400';
                        feedbackMessage = 'Excellent margin!';
                      } else if (actualCostPct <= 25) {
                        feedbackColor = 'text-blue-400';
                        feedbackMessage = 'Good margin';
                      } else if (actualCostPct <= 30) {
                        feedbackColor = 'text-yellow-400';
                        feedbackMessage = 'Acceptable margin';
                      } else {
                        feedbackColor = 'text-red-400';
                        feedbackMessage = 'Low margin - consider increasing price';
                      }
                    }
                    
                    return (
                      <FormItem>
                        <FormLabel>Selling Price</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            className="bg-slate-800 border-slate-600"
                            data-testid="input-price"
                          />
                        </FormControl>
                        {sellingPrice > 0 && (
                          <div className={`text-sm mt-2 ${feedbackColor}`}>
                            <div className="flex items-center justify-between">
                              <span>Cost: {actualCostPct.toFixed(1)}% | Profit: ${profitMargin.toFixed(2)}</span>
                              <span className="font-semibold">{feedbackMessage}</span>
                            </div>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="button-save-drink">
                    {editingMenuItemId ? 'Update' : 'Create'} Drink
                  </Button>
                </div>
              </form>
            </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search drinks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white max-w-md"
              data-testid="input-search-drinks"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">Loading...</div>
          ) : filteredMenuItems.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              {searchTerm ? 'No drinks found matching your search' : 'No drinks yet. Create your first drink!'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMenuItems.map((item) => (
                <Card key={item.id} className="bg-slate-800/50 border-slate-700" data-testid={`card-drink-${item.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base text-white mb-1">{item.name}</CardTitle>
                        <Badge className={`${getCategoryBadgeColor(item.category)} text-xs`}>
                          {item.category}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-400">${parseFloat(item.price).toFixed(2)}</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {item.description && (
                      <p className="text-sm text-slate-400 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleViewDetails(item)}
                        data-testid={`button-view-${item.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEdit(item)}
                        data-testid={`button-edit-${item.id}`}
                      >
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-900 border-slate-700">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Delete Drink?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{item.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-800 border-slate-600">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMenuItemMutation.mutate(item.id)}
                              className="bg-red-600 hover:bg-red-700"
                              data-testid={`button-confirm-delete-${item.id}`}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedMenuItem?.name}</DialogTitle>
          </DialogHeader>
          {selectedMenuItem && (
            <div className="space-y-4">
              <div>
                <Badge className={getCategoryBadgeColor(selectedMenuItem.category)}>
                  {selectedMenuItem.category}
                </Badge>
              </div>
              {selectedMenuItem.description && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-1">Description</h4>
                  <p className="text-slate-300">{selectedMenuItem.description}</p>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold text-slate-400 mb-2">Ingredients</h4>
                <div className="space-y-1">
                  {selectedMenuItem.ingredients?.map((ing: any) => (
                    <div key={ing.id} className="flex justify-between text-sm bg-slate-800/50 p-2 rounded">
                      <span>{ing.inventoryItem?.displayName || ing.inventoryItem?.name || 'Unknown'}</span>
                      <span className="text-slate-400">{ing.quantity} {ing.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-400">Price</div>
                  <div className="text-xl font-bold text-green-400">${parseFloat(selectedMenuItem.price).toFixed(2)}</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded">
                  <div className="text-xs text-slate-400">Status</div>
                  <div className="text-xl font-bold">
                    {selectedMenuItem.isActive ? (
                      <span className="text-green-400">Active</span>
                    ) : (
                      <span className="text-red-400">Inactive</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
