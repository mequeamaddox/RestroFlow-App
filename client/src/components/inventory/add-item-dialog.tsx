import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertInventoryItemSchema, type InsertInventoryItem, type Category, type Vendor } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useLocation } from "@/contexts/LocationContext";
import { Checkbox } from "@/components/ui/checkbox";
import { ScanLine, Camera, Calculator, AlertCircle } from "lucide-react";

interface AddItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  vendors: Vendor[];
  editingItem?: any;
  onDelete?: (item: any) => void;
}

export default function AddItemDialog({ isOpen, onClose, onSuccess, categories, vendors, editingItem, onDelete }: AddItemDialogProps) {
  const { toast } = useToast();
  const { currentLocation } = useLocation();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const form = useForm<InsertInventoryItem>({
    resolver: zodResolver(insertInventoryItemSchema),
    defaultValues: {
      name: "",
      displayName: undefined,
      description: undefined,
      categoryId: undefined,
      locationId: currentLocation?.id || "",
      quantity: "0",
      unit: "lbs",
      costPerUnit: "0",
      reorderLevel: "0",
      vendorId: undefined,
      barcode: undefined,
      alcoholContent: undefined,
      isAlcoholic: false,
      bottleSize: undefined,
      costPerPurchaseUnit: undefined,
      purchaseUnit: undefined,
      recipeUnit: undefined,
      conversionFactor: undefined,
      servingsPerPurchaseUnit: undefined,
    },
  });

  // Populate form with editing item data
  useEffect(() => {
    if (editingItem) {
      form.reset({
        name: editingItem.name || "",
        displayName: editingItem.displayName ?? undefined,
        description: editingItem.description ?? undefined,
        categoryId: editingItem.categoryId ?? undefined,
        locationId: editingItem.locationId || currentLocation?.id || "",
        quantity: editingItem.quantity?.toString() || "0",
        unit: editingItem.unit || "lbs",
        costPerUnit: editingItem.costPerUnit?.toString() || "0",
        reorderLevel: editingItem.reorderLevel?.toString() || "0",
        vendorId: editingItem.vendorId ?? undefined,
        barcode: editingItem.barcode ?? undefined,
        alcoholContent: editingItem.alcoholContent?.toString() ?? undefined,
        isAlcoholic: editingItem.isAlcoholic || false,
        bottleSize: editingItem.bottleSize ?? undefined,
        costPerPurchaseUnit: editingItem.costPerPurchaseUnit?.toString() ?? undefined,
        purchaseUnit: editingItem.purchaseUnit ?? undefined,
        recipeUnit: editingItem.recipeUnit ?? undefined,
        conversionFactor: editingItem.conversionFactor?.toString() ?? undefined,
        servingsPerPurchaseUnit: editingItem.servingsPerPurchaseUnit?.toString() ?? undefined,
        piecesPerLb: editingItem.piecesPerLb?.toString() ?? undefined,
        ozPerPiece: editingItem.ozPerPiece?.toString() ?? undefined,
        ozPerCup: editingItem.ozPerCup?.toString() ?? undefined,
        cupsPerGa: editingItem.cupsPerGa?.toString() ?? undefined,
        yieldPct: editingItem.yieldPct?.toString() ?? undefined,
        gradeLow: editingItem.gradeLow ?? undefined,
        gradeHigh: editingItem.gradeHigh ?? undefined,
      });
    } else {
      // Reset to default values when not editing
      form.reset({
        name: "",
        displayName: undefined,
        description: undefined,
        categoryId: undefined,
        locationId: currentLocation?.id || "",
        quantity: "0",
        unit: "lbs",
        costPerUnit: "0",
        reorderLevel: "0",
        vendorId: undefined,
        barcode: undefined,
        alcoholContent: undefined,
        isAlcoholic: false,
        bottleSize: undefined,
        costPerPurchaseUnit: undefined,
        purchaseUnit: undefined,
        recipeUnit: undefined,
        conversionFactor: undefined,
        servingsPerPurchaseUnit: undefined,
      });
    }
  }, [editingItem, currentLocation?.id, form]);

  // Determine item type based on selected category name
  const getItemType = (categoryId: string | undefined | null): 'bar' | 'food' | 'supplies' | null => {
    if (!categoryId) return null;
    
    const category = categories.find(c => c.id === categoryId);
    if (!category) return null;
    
    const n = category.name.toLowerCase();
    
    // Bar/Beverage — alcoholic and non-alcoholic bar inventory
    const barTerms = [
      'beer', 'draft', 'keg', 'lager', 'ale', 'ipa', 'stout',
      'wine', 'champagne', 'prosecco', 'sparkling',
      'spirit', 'liquor', 'liqueur', 'whiskey', 'whisky', 'vodka',
      'rum', 'tequila', 'gin', 'bourbon', 'brandy', 'cognac',
      'mixer', 'garnish', 'bar tool', 'bar supply', 'cocktail',
      'beverage', 'alcohol', 'bitters', 'syrup', 'cordial',
      'non-alcoholic', 'mocktail', 'soda', 'juice', 'energy drink',
    ];
    if (barTerms.some(term => n.includes(term))) return 'bar';
    
    // Food — proteins, produce, dairy, dry goods, sauces
    const foodTerms = [
      'protein', 'beef', 'chicken', 'poultry', 'pork', 'lamb',
      'seafood', 'fish', 'shrimp', 'shellfish', 'crab', 'lobster',
      'produce', 'vegetable', 'veggie', 'fruit', 'herb', 'spice',
      'dairy', 'cheese', 'butter', 'cream', 'milk', 'egg',
      'grain', 'pasta', 'rice', 'bread', 'flour', 'starch',
      'condiment', 'sauce', 'dressing', 'oil', 'vinegar',
      'dry good', 'canned', 'frozen', 'fresh', 'baking',
      'dessert', 'sweet', 'chocolate', 'ingredient',
    ];
    if (foodTerms.some(term => n.includes(term))) return 'food';
    
    // Supplies — non-food operational items
    const supplyTerms = [
      'cleaning', 'chemical', 'sanitizer', 'detergent',
      'office', 'admin', 'paper', 'napkin', 'towel', 'tissue',
      'supply', 'supplies', 'packaging', 'container', 'bag', 'wrap',
      'smallware', 'equipment', 'linen', 'uniform', 'maintenance',
    ];
    if (supplyTerms.some(term => n.includes(term))) return 'supplies';
    
    return null;
  };

  const selectedCategoryId = form.watch('categoryId');
  const itemType = getItemType(selectedCategoryId);

  const createItemMutation = useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      if (editingItem) {
        await apiRequest('PUT', `/api/inventory/${editingItem.id}`, data);
      } else {
        await apiRequest('POST', '/api/inventory', data);
      }
    },
    onSuccess: () => {
      onSuccess();
      form.reset();
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
        description: "Failed to create inventory item",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertInventoryItem) => {
    createItemMutation.mutate(data);
  };

  const handleBarcodeScanned = (barcode: string) => {
    form.setValue("barcode", barcode);
    setIsScannerOpen(false);
    toast({
      title: "Barcode Scanned",
      description: `Barcode ${barcode} added to the form`,
    });
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name (Full Vendor Name) *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sysco Premium Boneless Skinless Chicken Breast, 40 lb case" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name (Team-Friendly Name)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Chicken Breast" {...field} value={field.value || ""} />
                    </FormControl>
                    <p className="text-xs text-slate-400 mt-1">
                      Simple name your team can search for (e.g., "Chicken" instead of the full vendor product name)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.length > 0 ? (
                          categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-categories" disabled>
                            No categories available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {itemType && (
                      <p className="text-xs mt-1">
                        {itemType === 'bar' && <span className="text-blue-400">🍺 Bar item detected — beverage fields will appear below</span>}
                        {itemType === 'food' && <span className="text-green-400">🥩 Food item detected — recipe costing fields will appear below</span>}
                        {itemType === 'supplies' && <span className="text-slate-400">📦 Supply item — no extra fields needed</span>}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="25.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="gallons">gallons</SelectItem>
                        <SelectItem value="pieces">pieces</SelectItem>
                        <SelectItem value="cases">cases</SelectItem>
                        <SelectItem value="boxes">boxes</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="costPerUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost per Unit *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="8.50" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Bar/Beverage Specific Fields */}
            {itemType === 'bar' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pt-4 border-t border-slate-700">
                  <Calculator className="h-4 w-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-300">Beverage Details</h3>
                  <span className="text-xs text-slate-500">(Bar & beverage items)</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="isAlcoholic"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-slate-700 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Contains Alcohol
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="alcoholContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ABV % (Alcohol by Volume)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="5.0" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <p className="text-xs text-slate-500">e.g., Beer: 5%, Wine: 12%, Vodka: 40%</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bottleSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bottle/Container Size</FormLabel>
                        <FormControl>
                          <Input placeholder="750ml, 12oz, 1L" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <p className="text-xs text-slate-500">Standard serving size</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Multi-Unit Inventory Tracking Section - Food Items Only */}
            {itemType === 'food' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pt-4 border-t border-slate-700">
                <Calculator className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-300">Multi-Unit Inventory Tracking</h3>
                <span className="text-xs text-slate-500">(Optional - for advanced cost tracking)</span>
              </div>
              <p className="text-xs text-slate-400">
                Track items in different units for purchasing vs recipes. Example: Buy chicken in 40lb cases, use in recipes by lbs/oz.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="purchaseUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="How you buy this item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="case">case</SelectItem>
                          <SelectItem value="box">box</SelectItem>
                          <SelectItem value="bag">bag</SelectItem>
                          <SelectItem value="bulk">bulk</SelectItem>
                          <SelectItem value="pallet">pallet</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costPerPurchaseUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost per Purchase Unit</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="45.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="recipeUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipe Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="How recipes use this" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="lbs">lbs</SelectItem>
                          <SelectItem value="oz">oz</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="g">g</SelectItem>
                          <SelectItem value="cups">cups</SelectItem>
                          <SelectItem value="tbsp">tbsp</SelectItem>
                          <SelectItem value="tsp">tsp</SelectItem>
                          <SelectItem value="pieces">pieces</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="conversionFactor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Units per Purchase</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="40" {...field} />
                      </FormControl>
                      <p className="text-xs text-slate-500">How many recipe units in 1 purchase unit</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="servingsPerPurchaseUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Servings per Purchase</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" placeholder="160" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <p className="text-xs text-slate-500">Total servings from 1 purchase unit</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            )}

            {/* Recipe Costing Conversions Section - Food Items Only */}
            {itemType === 'food' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pt-4 border-t border-slate-700">
                <Calculator className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-300">Recipe Costing Conversions</h3>
                <span className="text-xs text-slate-500">(Optional - for precise recipe costing)</span>
              </div>
              <p className="text-xs text-slate-400">
                Configure conversion factors for accurate recipe cost calculations. Auto-populated from CSV imports.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="piecesPerLb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pieces per Lb</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="6.5" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <p className="text-xs text-slate-500">e.g., Wings: 6.5, Shrimp 16/20: 18</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ozPerPiece"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Oz per Piece</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="6" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <p className="text-xs text-slate-500">e.g., 6oz burger patty</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ozPerCup"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Oz per Cup</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="8" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <p className="text-xs text-slate-500">Default: 8 (water-like liquids)</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cupsPerGa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cups per Gallon</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="16" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <p className="text-xs text-slate-500">Default: 16</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="yieldPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yield %</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="100" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <p className="text-xs text-slate-500">Default: 100 (no waste)</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gradeLow"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade Low</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" placeholder="16" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} />
                      </FormControl>
                      <p className="text-xs text-slate-500">e.g., 16 in "16/20"</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gradeHigh"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade High</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" placeholder="20" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} />
                      </FormControl>
                      <p className="text-xs text-slate-500">e.g., 20 in "16/20"</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vendorId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vendors.length > 0 ? (
                          vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-vendors" disabled>
                            No vendors available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reorderLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reorder Level</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="5.0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barcode (Optional)</FormLabel>
                  <div className="flex space-x-2">
                    <FormControl>
                      <Input placeholder="Scan or enter barcode" {...field} value={field.value ?? ''} className="flex-1" />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsScannerOpen(true)}
                      className="px-3"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
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
                    <Textarea 
                      rows={3} 
                      placeholder="Additional details about the item..."
                      {...field}
                      value={field.value ?? ''} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-between items-center pt-6 border-t border-border">
              {editingItem && onDelete && (
                <Button 
                  type="button" 
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  data-testid={`button-delete-item-dialog-${editingItem.id}`}
                >
                  Delete Item
                </Button>
              )}
              <div className={`flex space-x-3 ${!editingItem || !onDelete ? 'w-full justify-end' : ''}`}>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createItemMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {createItemMutation.isPending ? 
                    (editingItem ? "Updating..." : "Adding...") : 
                    (editingItem ? "Update Item" : "Add Item")
                  }
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Delete Inventory Item
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{editingItem?.name}"? This will remove the item and its references from recipes, transactions, and vendor pricing. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (editingItem && onDelete) {
                  onDelete(editingItem);
                  setShowDeleteConfirm(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
