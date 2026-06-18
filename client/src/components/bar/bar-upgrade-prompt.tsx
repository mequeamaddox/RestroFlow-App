import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Martini, Calculator, Package, Percent, ArrowRight, Star, Zap } from "lucide-react";
import { Link } from "wouter";

interface BarUpgradePromptProps {
  locationName: string;
}

export function BarUpgradePrompt({ locationName }: BarUpgradePromptProps) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card className="border-purple-800/50 bg-gradient-to-br from-purple-900/20 to-violet-900/20">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Badge variant="secondary" className="bg-purple-900/30 text-purple-400 border border-purple-700">
              <Zap className="w-3 h-3 mr-1" />
              Bar & Beverage Add-on Required
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Unlock Bar & Beverage Tools for {locationName}
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Professional pour cost analysis, cocktail costing, and beverage menu management
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-8">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-900/30">
                  <Martini className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Beverage Menu</h3>
                  <p className="text-sm text-muted-foreground">Build cocktail recipes with ingredient-level cost tracking</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-violet-900/30">
                  <Calculator className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Pour Cost Calculator</h3>
                  <p className="text-sm text-muted-foreground">Spirits, kegs, mixers, and cocktail cost-per-serve analysis</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-pink-900/30">
                  <Package className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Liquor Inventory</h3>
                  <p className="text-sm text-muted-foreground">Track spirits, beer, and wine with bottle-level precision</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-fuchsia-900/30">
                  <Percent className="w-5 h-5 text-fuchsia-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Waste & Variance Tracking</h3>
                  <p className="text-sm text-muted-foreground">Identify pour variance and shrinkage to protect margins</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-purple-200 p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Star className="w-5 h-5 text-purple-500" />
              <span className="font-semibold text-foreground">Bar & Beverage Add-on</span>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">
              $79<span className="text-lg font-normal text-muted-foreground">/month</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Per location • Cancel anytime</p>

            <div className="space-y-3">
              <Link href="/subscription">
                <Button size="lg" className="w-full bg-purple-600 hover:bg-purple-700">
                  Add Bar & Beverage Add-on
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Includes all bar features for this location
              </p>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground bg-muted rounded-lg p-4">
            <p>
              Your current <strong>Core Platform</strong> subscription covers food inventory, recipes,
              purchase orders, and analytics. Add the Bar & Beverage add-on to unlock bar-specific tools.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
