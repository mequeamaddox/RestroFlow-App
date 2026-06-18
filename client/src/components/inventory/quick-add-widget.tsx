import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Plus, AlertCircle } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { Link } from "wouter";

export default function QuickAddWidget() {
  const { currentLocation } = useLocation();

  if (!currentLocation) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Select a location to use quick-add</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <Package className="h-5 w-5 mr-2 text-blue-500" />
          <span className="text-white">Quick Add Inventory</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <Link href="/inventory?quickAdd=true">
          <Button className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-5 w-5 mr-2" />
            Add Item to Inventory
          </Button>
        </Link>

        <div className="text-xs text-slate-400 text-center">
          Adding to: <span className="text-blue-400 font-medium">{currentLocation.name}</span>
        </div>
      </CardContent>
    </Card>
  );
}
