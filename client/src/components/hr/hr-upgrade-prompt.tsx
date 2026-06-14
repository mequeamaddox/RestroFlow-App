import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, MessageSquare, DollarSign, ArrowRight, Star, Zap } from "lucide-react";

interface HRUpgradePromptProps {
  locationName: string;
}

export function HRUpgradePrompt({ locationName }: HRUpgradePromptProps) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card className="border-orange-800/50 bg-gradient-to-br from-orange-900/20 to-amber-900/20">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Badge variant="secondary" className="bg-orange-900/30 text-orange-400 border border-orange-700">
              <Zap className="w-3 h-3 mr-1" />
              HR Add-on Required
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Unlock Full HR Management for {locationName}
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Get comprehensive employee management tools designed for restaurant operations
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-8">
          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-900/30">
                  <Users className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Employee Directory</h3>
                  <p className="text-sm text-muted-foreground">Complete employee profiles, contact info, and role management</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-900/30">
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Time Clock & Scheduling</h3>
                  <p className="text-sm text-muted-foreground">Digital time tracking, shift scheduling, and attendance monitoring</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-green-900/30">
                  <MessageSquare className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Team Communication</h3>
                  <p className="text-sm text-muted-foreground">Internal messaging, announcements, and task assignments</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-900/30">
                  <DollarSign className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Payroll Management</h3>
                  <p className="text-sm text-muted-foreground">Automated payroll processing with tax compliance</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-card rounded-xl border border-orange-200 p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Star className="w-5 h-5 text-orange-500" />
              <span className="font-semibold text-foreground">HR Add-on</span>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">
              $79<span className="text-lg font-normal text-muted-foreground">/month</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Per location • Cancel anytime</p>
            
            <div className="space-y-3">
              <Button size="lg" className="w-full bg-orange-600 hover:bg-orange-700">
                Upgrade to HR Add-on
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-xs text-muted-foreground">
                Includes all HR features for this location
              </p>
            </div>
          </div>

          {/* Current Plan Note */}
          <div className="text-center text-sm text-muted-foreground bg-muted rounded-lg p-4">
            <p>
              Your current <strong>Core Platform</strong> subscription covers inventory management, 
              POS integration, and basic analytics. Add HR functionality to unlock employee management features.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}