import type { Express } from 'express';
import { storage } from '../storage';
import { isAuthenticated } from './helpers';
import { requireLocationAccess, assertLocationAccess } from '../securityMiddleware';
import { insertRecipeSchema, insertMenuItemSchema, insertMenuItemIngredientSchema } from '@shared/schema';
import { varianceService } from '../varianceService';
import { ObjectStorageService } from '../objectStorage';

export function registerRecipeRoutes(app: Express): void {
  // Recipes
  app.get('/api/recipes', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const recipes = await storage.getRecipes(req.query.locationId as string);
      res.json(recipes);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      res.status(500).json({ message: 'Failed to fetch recipes' });
    }
  });

  app.get('/api/recipes/:id', isAuthenticated, async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) return res.status(404).json({ message: 'Recipe not found' });
      if (recipe.locationId && !await assertLocationAccess(req, res, recipe.locationId)) return;
      res.json(recipe);
    } catch (error) {
      console.error('Error fetching recipe:', error);
      res.status(500).json({ message: 'Failed to fetch recipe' });
    }
  });

  app.post('/api/recipes', isAuthenticated, async (req, res) => {
    try {
      const { ingredients, ...recipeData } = req.body;
      const parsedRecipeData = insertRecipeSchema.parse(recipeData);
      if (parsedRecipeData.locationId && !await assertLocationAccess(req, res, parsedRecipeData.locationId)) return;
      if (ingredients && ingredients.length > 0) {
        const recipe = await storage.createRecipeWithIngredients({
          ...parsedRecipeData,
          ingredients: ingredients.map((ing: any) => ({ inventoryItemId: ing.inventoryItemId, quantity: ing.quantity, unit: ing.unit })),
        });
        res.status(201).json(recipe);
      } else {
        const recipe = await storage.createRecipe(parsedRecipeData);
        res.status(201).json(recipe);
      }
    } catch (error) {
      console.error('Error creating recipe:', error);
      res.status(400).json({ message: 'Failed to create recipe' });
    }
  });

  app.put('/api/recipes/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { ingredients, ...recipeData } = req.body;
      const existing = await storage.getRecipe(id);
      if (!existing) return res.status(404).json({ message: 'Recipe not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      const recipe = await storage.updateRecipe(id, insertRecipeSchema.partial().parse(recipeData));
      if (ingredients !== undefined) {
        await storage.deleteRecipeIngredients(id);
        if (ingredients.length > 0) {
          await storage.addRecipeIngredients(ingredients.map((ing: any) => ({ recipeId: id, inventoryItemId: ing.inventoryItemId, quantity: ing.quantity, unit: ing.unit })));
        }
      }
      res.json(recipe);
    } catch (error) {
      console.error('Error updating recipe:', error);
      res.status(400).json({ message: 'Failed to update recipe' });
    }
  });

  app.delete('/api/recipes/:id', isAuthenticated, async (req, res) => {
    try {
      const existing = await storage.getRecipe(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Recipe not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      await storage.deleteRecipe(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting recipe:', error);
      res.status(400).json({ message: 'Failed to delete recipe' });
    }
  });

  // Recipe photo
  app.put('/api/recipes/:id/photo', isAuthenticated, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });
      const existing = await storage.getRecipe(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Recipe not found' });
      if (existing.locationId && !await assertLocationAccess(req, res, existing.locationId)) return;
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(imageUrl);
      const updatedRecipe = await storage.updateRecipe(req.params.id, { imageUrl: objectPath });
      res.json(updatedRecipe);
    } catch (error) {
      console.error('Error updating recipe photo:', error);
      res.status(500).json({ error: 'Failed to update recipe photo' });
    }
  });

  // Menu Items
  app.get('/api/menu-items', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const menuItems = await storage.getMenuItems(req.query.locationId as string);
      res.json(menuItems);
    } catch (error) {
      console.error('Error fetching menu items:', error);
      res.status(500).json({ message: 'Failed to fetch menu items' });
    }
  });

  app.post('/api/menu-items', isAuthenticated, async (req, res) => {
    try {
      const menuItemData = insertMenuItemSchema.parse(req.body);
      if (menuItemData.locationId && !await assertLocationAccess(req, res, menuItemData.locationId)) return;
      const menuItem = await storage.createMenuItem(menuItemData);
      res.status(201).json(menuItem);
    } catch (error) {
      console.error('Error creating menu item:', error);
      res.status(400).json({ message: 'Failed to create menu item' });
    }
  });

  app.post('/api/recipes/:id/ingredients', isAuthenticated, async (req, res) => {
    try {
      const ingredientData = insertMenuItemIngredientSchema.parse({ ...req.body, menuItemId: req.params.id });
      const ingredient = await storage.addMenuItemIngredient(ingredientData);
      res.status(201).json(ingredient);
    } catch (error) {
      console.error('Error adding menu item ingredient:', error);
      res.status(400).json({ message: 'Failed to add menu item ingredient' });
    }
  });

  app.delete('/api/menu-item-ingredients/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.removeMenuItemIngredient(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error removing menu item ingredient:', error);
      res.status(400).json({ message: 'Failed to remove menu item ingredient' });
    }
  });

  // Variance Reporting
  app.get('/api/variance/summary', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'Location ID is required' });
      const summary = await varianceService.getVarianceSummary(locationId, parseInt(req.query.days as string) || 30);
      res.json(summary);
    } catch (error) {
      console.error('Error fetching variance summary:', error);
      res.status(500).json({ message: 'Failed to fetch variance summary' });
    }
  });

  app.get('/api/variance/report', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      if (!locationId || !startDate || !endDate) return res.status(400).json({ message: 'Location ID, start date, and end date are required' });
      const report = await varianceService.generateVarianceReport(locationId, startDate, endDate);
      res.json(report);
    } catch (error) {
      console.error('Error generating variance report:', error);
      res.status(500).json({ message: 'Failed to generate variance report' });
    }
  });

  app.get('/api/variance/production', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      if (!locationId || !startDate || !endDate) return res.status(400).json({ message: 'Location ID, start date, and end date are required' });
      const variance = await varianceService.getProductionVariance(locationId, startDate, endDate);
      res.json(variance);
    } catch (error) {
      console.error('Error fetching production variance:', error);
      res.status(500).json({ message: 'Failed to fetch production variance' });
    }
  });

  app.post('/api/variance/production', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { recipeId, locationId, quantityProduced, batchNumber } = req.body;
      if (!recipeId || !locationId || !quantityProduced) return res.status(400).json({ message: 'Recipe ID, location ID, and quantity produced are required' });
      const productionId = await varianceService.recordRecipeProduction(recipeId, locationId, parseFloat(quantityProduced), req.user!.id, batchNumber);
      if (!productionId) return res.status(500).json({ message: 'Failed to record production' });
      res.json({ id: productionId, message: 'Production recorded successfully' });
    } catch (error) {
      console.error('Error recording production:', error);
      res.status(500).json({ message: 'Failed to record production' });
    }
  });

  app.post('/api/variance/generate', isAuthenticated, requireLocationAccess(), async (req, res) => {
    try {
      const { locationId, startDate, endDate } = req.body;
      if (!locationId || !startDate || !endDate) return res.status(400).json({ message: 'Location ID, start date, and end date are required' });
      const report = await varianceService.generateVarianceReport(locationId, new Date(startDate), new Date(endDate));
      res.json({ message: 'Variance report generated successfully', itemsAnalyzed: report.length });
    } catch (error) {
      console.error('Error generating variance report:', error);
      res.status(500).json({ message: 'Failed to generate variance report' });
    }
  });

  // Recipe Costing
  app.get('/api/recipes/:id/costing', isAuthenticated, async (req, res) => {
    try {
      const locationId = req.query.locationId as string;
      if (!locationId) return res.status(400).json({ message: 'Location ID is required' });
      const costing = await varianceService.calculateRecipeCost(req.params.id, locationId);
      if (!costing) return res.status(404).json({ message: 'Recipe not found or unable to calculate cost' });
      res.json(costing);
    } catch (error) {
      console.error('Error calculating recipe cost:', error);
      res.status(500).json({ message: 'Failed to calculate recipe cost' });
    }
  });

}
