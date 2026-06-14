import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ScanLine, ShoppingCart, FileText } from "lucide-react";
import { useLocation } from "wouter";

export default function QuickActions() {
  const [, navigate] = useLocation();
  const actions = [
    {
      title: "Add Inventory",
      icon: Plus,
      href: "/inventory",
      className: "bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700 shadow-lg",
    },
    {
      title: "Purchase Order",
      icon: ShoppingCart,
      href: "/purchase-orders",
      className: "bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-slate-600/50 hover:text-white",
    },
    {
      title: "Reports",
      icon: FileText,
      href: "/analytics",
      className: "bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-slate-600/50 hover:text-white",
    },
  ];

  return (
    <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700/50">
      <CardHeader className="pb-3 lg:pb-6">
        <CardTitle className="text-white text-base lg:text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile: Horizontal scroll */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 lg:hidden scrollbar-hide">
          {actions.map((action, index) => {
            const Icon = action.icon;
            
            return (
              <Button 
                key={index}
                onClick={() => navigate(action.href)}
                className={`flex-shrink-0 flex flex-col h-24 w-24 p-2 transition-all duration-300 active:scale-95 ${action.className}`}
                variant={index === 0 ? "default" : "outline"}
                data-testid={`button-quick-action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="h-6 w-6 mb-2" />
                <span className="text-xs text-center leading-tight">{action.title}</span>
              </Button>
            );
          })}
        </div>
        
        {/* Desktop: Vertical list */}
        <div className="hidden lg:block space-y-3">
          {actions.map((action, index) => {
            const Icon = action.icon;
            
            return (
              <Button 
                key={index}
                onClick={() => navigate(action.href)}
                className={`w-full justify-center transition-all duration-300 transform hover:scale-105 ${action.className}`}
                variant={index === 0 ? "default" : "outline"}
                data-testid={`button-quick-action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {action.title}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
