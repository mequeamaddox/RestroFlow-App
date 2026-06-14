import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, ShoppingCart, Trash2, Clock, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: 'inventory' | 'recipe' | 'purchase_order' | 'invoice' | 'waste';
  description: string;
  user?: string;
  timestamp: string;
  createdAt: string;
}

export default function RecentActivity() {
  const { user } = useAuth();
  const { currentLocation } = useLocation();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['/api/activities', currentLocation?.id],
    enabled: !!currentLocation,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'inventory': return { icon: Plus, color: 'text-green-400', bg: 'bg-green-900/30' };
      case 'recipe': return { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-900/30' };
      case 'purchase_order': return { icon: ShoppingCart, color: 'text-orange-400', bg: 'bg-orange-900/30' };
      case 'invoice': return { icon: FileText, color: 'text-purple-400', bg: 'bg-purple-900/30' };
      case 'waste': return { icon: Trash2, color: 'text-red-400', bg: 'bg-red-900/30' };
      default: return { icon: Edit, color: 'text-muted-foreground', bg: 'bg-accent' };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded animate-pulse mb-2" />
                  <div className="h-3 bg-accent rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" className="text-primary-600 hover:text-primary-700">
          View All
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.slice(0, 5).map((activity: ActivityItem) => {
            const { icon: Icon, color, bg } = getActivityIcon(activity.type);
            
            return (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className={`w-8 h-8 ${bg} rounded-full flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`${color} text-xs h-4 w-4`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground dark:text-gray-100">
                    {activity.description}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-xs text-muted-foreground dark:text-gray-400">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                      {activity.user && ` • ${activity.user}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {activities.length === 0 && (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground dark:text-gray-100 mb-2">No recent activity</h3>
            <p className="text-xs text-muted-foreground dark:text-gray-400">Activity will appear here as you use the system.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
