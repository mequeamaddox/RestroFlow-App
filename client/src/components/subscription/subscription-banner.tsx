import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Crown, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionData {
  plan: 'free' | 'professional';
  status: string;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  hasUnlimitedOcr: boolean;
  subscriptionEndDate?: string;
}

export function SubscriptionBanner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subscription, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['/api/user/subscription'],
  });

  const upgradeMutation = useMutation({
    mutationFn: async (plan: string) => {
      const response = await apiRequest("POST", "/api/user/upgrade-plan", { plan });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/subscription'] });
      toast({
        title: "Upgrade Successful!",
        description: "You now have unlimited OCR processing",
      });
    },
    onError: () => {
      toast({
        title: "Upgrade Failed",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  });

  const resetCreditsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/reset-credits", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/subscription'] });
      toast({
        title: "Credits Reset",
        description: "Your OCR credits have been reset for testing",
      });
    }
  });

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="animate-pulse flex space-x-4">
            <div className="rounded-full bg-slate-200 h-10 w-10"></div>
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) return null;

  const isPremium = subscription.plan === 'professional';
  const creditsPercentage = (subscription.creditsUsed / subscription.creditsLimit) * 100;

  return (
    <Card className="mb-6 border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPremium ? (
              <Crown className="h-5 w-5 text-yellow-500" />
            ) : (
              <Zap className="h-5 w-5 text-blue-500" />
            )}
            <CardTitle className="text-lg">
              {subscription.plan === 'free' ? 'Free Plan' : 'Professional Plan'}
            </CardTitle>
            <Badge variant={isPremium ? "default" : "secondary"}>
              {subscription.status}
            </Badge>
          </div>
          
          {!isPremium && (
            <Button
              onClick={() => upgradeMutation.mutate('professional')}
              disabled={upgradeMutation.isPending}
              size="sm"
              className="gap-2"
            >
              <Crown className="h-4 w-4" />
              Upgrade to Premium
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* OCR Credits Display */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">OCR Processing Credits</span>
              {isPremium ? (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Unlimited</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {subscription.creditsRemaining} / {subscription.creditsLimit} remaining
                </span>
              )}
            </div>
            
            {!isPremium && (
              <>
                <Progress value={creditsPercentage} className="h-2" />
                {subscription.creditsRemaining <= 1 && (
                  <div className="flex items-center gap-1 mt-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Running low on credits! Upgrade for unlimited access.</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Plan Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="font-medium">Invoice Processing</div>
              <div className="text-muted-foreground">
                {isPremium ? 'Advanced OCR + Image Recognition' : 'Basic Text Extraction'}
              </div>
            </div>
            <div>
              <div className="font-medium">File Support</div>
              <div className="text-muted-foreground">
                {isPremium ? 'PDF, Images, Text Files' : 'PDF & Text Files Only'}
              </div>
            </div>
            <div>
              <div className="font-medium">Processing Limit</div>
              <div className="text-muted-foreground">
                {isPremium ? 'Unlimited' : `${subscription.creditsLimit}/month`}
              </div>
            </div>
          </div>

          {/* Development Tools */}
          {subscription.plan === 'free' && (
            <div className="pt-2 border-t">
              <Button
                onClick={() => resetCreditsMutation.mutate()}
                disabled={resetCreditsMutation.isPending}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Reset Credits (Testing)
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}