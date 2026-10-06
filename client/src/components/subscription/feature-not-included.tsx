import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { usePermissions } from "@/contexts/PermissionContext";
import { isOwnerLevel } from "@shared/roles";

/** Owners pay for the service; everyone else only sees what the owner's plan includes. */
export function useIsPayer() {
  const { userRole } = usePermissions();
  return isOwnerLevel(userRole);
}

export function FeatureNotIncluded({ feature, locationName }: { feature: string; locationName?: string }) {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card>
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-3">
              <Lock className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl">{feature} isn't available here</CardTitle>
          <CardDescription>
            {locationName ? `${feature} isn't part of ${locationName}'s plan.` : `${feature} isn't part of your restaurant's plan.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Ask the restaurant owner if you need access.
        </CardContent>
      </Card>
    </div>
  );
}
