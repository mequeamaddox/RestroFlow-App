import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChefHat, Search, Printer, Clock, Users, DollarSign, Eye, CheckCircle, AlertCircle, Wine, GlassWater } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "@/contexts/LocationContext";
import { apiRequest } from "@/lib/queryClient";

type MainTab = "food" | "cocktail";

interface Recipe {
  id: string;
  name: string;
  category: string;
  description?: string;
  prepTime?: number;
  servingSize?: number;
  ingredients: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
  instructions?: string;
  costPerServing?: number;
}

interface RecipeAssignment {
  id: string;
  employeeId: string;
  recipeId: string;
  assignedBy: string;
  dueDate: Date;
  status: 'assigned' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  notes?: string;
  completedAt?: Date;
  createdAt: Date;
  recipe: Recipe;
}

interface CocktailIngredient {
  menuItemId: string;
  quantity: string;
  unit: string;
  itemName: string;
  displayName: string | null;
}

interface CocktailBuildSheet {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: string;
  ingredients: CocktailIngredient[];
}

function getCategoryBadgeClass(category: string): string {
  switch (category.toLowerCase()) {
    case "cocktail":
      return "bg-purple-900/30 text-purple-400 border border-purple-800";
    case "beer":
      return "bg-amber-900/30 text-amber-400 border border-amber-800";
    case "wine":
      return "bg-rose-900/30 text-rose-400 border border-rose-800";
    case "spirit":
      return "bg-blue-900/30 text-blue-400 border border-blue-800";
    case "non-alcoholic":
      return "bg-green-900/30 text-green-400 border border-green-800";
    default:
      return "bg-gray-900/30 text-gray-400 border border-gray-700";
  }
}

function formatIngredient(ingredient: CocktailIngredient): string {
  const name = ingredient.displayName ?? ingredient.itemName;
  return `${ingredient.quantity} ${ingredient.unit} ${name}`.trim();
}

export default function EmployeeBuildSheets() {
  const { user } = useAuth();
  const { currentLocation } = useLocation();
  const [mainTab, setMainTab] = useState<MainTab>("food");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showBuildSheet, setShowBuildSheet] = useState(false);
  const queryClient = useQueryClient();

  const locationId = currentLocation?.id;

  // Fetch assigned recipe build sheets for this employee
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<RecipeAssignment[]>({
    queryKey: ['/api/employees', user?.id, 'recipe-assignments'],
    enabled: !!user?.id,
  });

  // Fetch cocktail build sheets
  const { data: cocktailSheets = [], isLoading: cocktailLoading } = useQuery<CocktailBuildSheet[]>({
    queryKey: ['/api/bar/build-sheets', locationId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/bar/build-sheets?locationId=${locationId}`);
      return res.json();
    },
    enabled: !!locationId,
  });

  // Add status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ assignmentId, status }: { assignmentId: string; status: string }) => {
      return await apiRequest("PUT", `/api/recipe-assignments/${assignmentId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees', user?.id, 'recipe-assignments'] });
    },
  });

  // Extract recipes from assignments and filter
  const recipes = assignments.map(assignment => assignment.recipe);
  const filteredAssignments = assignments.filter(assignment => {
    const recipe = assignment.recipe;
    const matchesSearch = recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         recipe.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || recipe.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories from assigned recipes
  const categories = Array.from(new Set(recipes.map(recipe => recipe.category)));

  const generateBuildSheet = (recipe: Recipe) => {
    const buildSheetContent = `
=================================================
BUILD SHEET - ${recipe.name.toUpperCase()}
=================================================

Category: ${recipe.category}
${recipe.description ? `Description: ${recipe.description}` : ''}
${recipe.prepTime ? `Prep Time: ${recipe.prepTime} minutes` : ''}
${recipe.servingSize ? `Serving Size: ${recipe.servingSize} portions` : ''}

INGREDIENTS:
-------------------------------------------------
${recipe.ingredients.map(ing =>
  `• ${ing.quantity} ${ing.unit} - ${ing.name}${ing.notes ? ` (${ing.notes})` : ''}`
).join('\n')}

INSTRUCTIONS:
-------------------------------------------------
${recipe.instructions || 'Follow standard preparation procedures for this recipe.'}

COST INFORMATION:
-------------------------------------------------
${recipe.costPerServing ? `Cost per serving: $${recipe.costPerServing.toFixed(2)}` : 'Cost calculation pending'}

=================================================
Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
Employee: ${user?.email || 'Unknown'}
=================================================
    `;

    // Create a blob and download
    const blob = new Blob([buildSheetContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.name.replace(/\s+/g, '_')}_build_sheet.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const isLoading = mainTab === "food" ? assignmentsLoading : cocktailLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading build sheets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-6 w-6" />
            Recipe Build Sheets
          </h1>
          <p className="text-muted-foreground">Access recipe instructions and prep sheets for kitchen use</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="bg-blue-900/30 text-blue-400 border border-blue-800">
            {assignments.length} Assigned Recipes
          </Badge>
          <Badge variant="secondary" className="bg-green-900/30 text-green-400 border border-green-800">
            {assignments.filter(a => a.status === 'completed').length} Completed
          </Badge>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-0 border-b border-border">
        <button
          onClick={() => setMainTab("food")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            mainTab === "food"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-food-build-sheets"
        >
          <ChefHat className="h-4 w-4" />
          Food Build Sheets
        </button>
        <button
          onClick={() => setMainTab("cocktail")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            mainTab === "cocktail"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-cocktail-build-sheets"
        >
          <Wine className="h-4 w-4" />
          Cocktail Build Sheets
        </button>
      </div>

      {/* Food Build Sheets Tab */}
      {mainTab === "food" && (
        <>
          {/* Search and Filters */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <Input
                placeholder="Search recipes by name or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-recipe-search"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-border rounded-md px-3 py-2 bg-card min-w-[150px]"
              data-testid="select-category-filter"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          {/* Recipe Assignment Cards */}
          {filteredAssignments.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssignments.map((assignment) => {
                const recipe = assignment.recipe;
                const getStatusBadge = (status: string) => {
                  switch (status) {
                    case 'completed':
                      return <Badge className="bg-green-900/30 text-green-400 border border-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
                    case 'in-progress':
                      return <Badge className="bg-blue-900/30 text-blue-400 border border-blue-800">In Progress</Badge>;
                    case 'assigned':
                    default:
                      return <Badge className="bg-yellow-900/30 text-yellow-400 border border-yellow-800">Assigned</Badge>;
                  }
                };

                const getPriorityBadge = (priority: string) => {
                  switch (priority) {
                    case 'high':
                      return <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />High</Badge>;
                    case 'medium':
                      return <Badge variant="outline" className="text-xs">Medium</Badge>;
                    case 'low':
                    default:
                      return <Badge variant="secondary" className="text-xs">Low</Badge>;
                  }
                };

                return (
                <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <span className="truncate">{recipe.name}</span>
                      <div className="flex gap-1">
                        {getPriorityBadge(assignment.priority)}
                        <Badge variant="outline" className="ml-1">
                          {recipe.category}
                        </Badge>
                      </div>
                    </CardTitle>
                    <div className="flex items-center justify-between">
                      {getStatusBadge(assignment.status)}
                      {assignment.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          Due: {new Date(assignment.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{recipe.description}</p>
                    )}
                    {assignment.notes && (
                      <p className="text-xs text-blue-400 bg-blue-900/20 p-2 rounded mt-2">
                        Note: {assignment.notes}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {recipe.prepTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {recipe.prepTime}m
                        </div>
                      )}
                      {recipe.servingSize && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {recipe.servingSize} portions
                        </div>
                      )}
                      {recipe.costPerServing && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${recipe.costPerServing.toFixed(2)}
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">{recipe.ingredients.length}</span> ingredients required
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRecipe(recipe);
                          setShowBuildSheet(true);
                        }}
                        className="flex-1"
                        data-testid={`button-view-recipe-${assignment.id}`}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => generateBuildSheet(recipe)}
                        className="flex-1"
                        data-testid={`button-print-recipe-${assignment.id}`}
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Print
                      </Button>
                    </div>

                    {/* Status Update Buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      {assignment.status === 'assigned' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ assignmentId: assignment.id, status: 'in-progress' })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-start-recipe-${assignment.id}`}
                        >
                          Start Recipe
                        </Button>
                      )}
                      {assignment.status === 'in-progress' && (
                        <Button
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ assignmentId: assignment.id, status: 'completed' })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-complete-recipe-${assignment.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Mark Complete
                        </Button>
                      )}
                      {assignment.status === 'completed' && assignment.completedAt && (
                        <span className="text-xs text-green-600 flex items-center">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed {new Date(assignment.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )})}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <ChefHat className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No assigned recipes found</h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedCategory !== "all"
                  ? "Try adjusting your search terms or category filter"
                  : "You don't have any recipe assignments yet. Check with your manager for training assignments."
                }
              </p>
            </Card>
          )}

          {/* Build Sheet View Dialog */}
          <Dialog open={showBuildSheet} onOpenChange={setShowBuildSheet}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ChefHat className="h-5 w-5" />
                  Build Sheet - {selectedRecipe?.name}
                </DialogTitle>
              </DialogHeader>

              {selectedRecipe && (
                <div className="space-y-6 p-4">
                  {/* Recipe Header */}
                  <div className="bg-muted p-4 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2">{selectedRecipe.name}</h2>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>Category: {selectedRecipe.category}</span>
                      {selectedRecipe.prepTime && <span>Prep: {selectedRecipe.prepTime} min</span>}
                      {selectedRecipe.servingSize && <span>Serves: {selectedRecipe.servingSize}</span>}
                    </div>
                    {selectedRecipe.description && (
                      <p className="mt-2 text-foreground">{selectedRecipe.description}</p>
                    )}
                  </div>

                  {/* Ingredients */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Ingredients</h3>
                    <div className="space-y-2">
                      {selectedRecipe.ingredients.map((ingredient) => (
                        <div key={ingredient.id} className="flex items-center justify-between p-3 bg-card border rounded">
                          <div className="flex-1">
                            <span className="font-medium">{ingredient.name}</span>
                            {ingredient.notes && (
                              <span className="text-muted-foreground ml-2">({ingredient.notes})</span>
                            )}
                          </div>
                          <Badge variant="outline">
                            {ingredient.quantity} {ingredient.unit}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Instructions */}
                  {selectedRecipe.instructions && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Preparation Instructions</h3>
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="whitespace-pre-line">{selectedRecipe.instructions}</p>
                      </div>
                    </div>
                  )}

                  {/* Cost Information */}
                  {selectedRecipe.costPerServing && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Cost Information</h3>
                      <div className="bg-blue-900/20 border border-blue-800/40 p-4 rounded-lg">
                        <p>Cost per serving: <span className="font-semibold">${selectedRecipe.costPerServing.toFixed(2)}</span></p>
                      </div>
                    </div>
                  )}

                  {/* Print Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      onClick={() => generateBuildSheet(selectedRecipe)}
                      data-testid="button-download-build-sheet"
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Download Build Sheet
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Cocktail Build Sheets Tab */}
      {mainTab === "cocktail" && (
        <>
          {cocktailSheets.length === 0 ? (
            <Card className="p-12 text-center">
              <GlassWater className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No cocktail recipes added yet</h3>
              <p className="text-muted-foreground">
                Cocktail build sheets will appear here once your manager adds them.
              </p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cocktailSheets.map((cocktail) => (
                <Card key={cocktail.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">{cocktail.name}</span>
                      <Badge className={getCategoryBadgeClass(cocktail.category)}>
                        {cocktail.category.charAt(0).toUpperCase() + cocktail.category.slice(1)}
                      </Badge>
                    </CardTitle>
                    {cocktail.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{cocktail.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Ingredients
                      </p>
                      <ul className="space-y-1">
                        {cocktail.ingredients.map((ing, idx) => (
                          <li
                            key={`${ing.menuItemId}-${idx}`}
                            className="text-sm flex items-start gap-2"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                            <span>{formatIngredient(ing)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {cocktail.ingredients.length} ingredient{cocktail.ingredients.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-sm font-medium">${parseFloat(cocktail.price).toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
