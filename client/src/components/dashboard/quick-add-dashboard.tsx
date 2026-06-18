import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Plus } from "lucide-react";
import { useLocation } from "@/contexts/LocationContext";
import { Link } from "wouter";

export default function QuickAddDashboard() {
  const { currentLocation } = useLocation();

  if (!currentLocation) {
    return null;
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-lg">
          <Package className="h-5 w-5 mr-2 text-primary-600" />
          Quick Add Inventory
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Add items to your inventory for {currentLocation.name}
          </p>
        </div>

        <Link href="/inventory">
          <Button className="w-full bg-primary-600 hover:bg-primary-700">
            <Plus className="h-4 w-4 mr-2" />
            Go to Inventory
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
