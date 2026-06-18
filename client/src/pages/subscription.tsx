import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  CreditCard,
  Calendar,
  Star,
  Crown,
  ChefHat,
  AlertCircle,
  Loader2,
  ExternalLink,
  Settings,
  Users,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";

interface SubscriptionInfo {
  id: string;
  plan: string;
  status: string;
  nextBillingDate: string;
  totalAmount: number;
  hrAddonLocations: number;
  barAddonLocations: number;
  locationCount: number;
  createdAt: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

interface UserInfo {
  ocrCreditsUsed?: number;
  ocrCreditsLimit?: number;
}

interface LocationInfo {
  id: string;
  name: string;
  type: string;
  hrAddonEnabled: boolean;
  barAddonEnabled: boolean;
}

const PLAN_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    icon: ChefHat,
    color: 'from-slate-500 to-gray-600',
    features: ['1 location', '5 OCR invoice scans/month', 'Basic inventory tracking', 'Recipe costing'],
  },
  core: {
    name: 'RestroFlow Core',
    price: 179,
    icon: Star,
    color: 'from-orange-500 to-red-500',
    features: ['Up to 3 locations', 'Unlimited OCR scanning', 'Advanced analytics', 'POS integration', 'Waste tracking', 'Vendor management'],
  },
};

export default function SubscriptionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true' && user) {
      toast({
        title: "🎉 Subscription Activated!",
        description: "Welcome to RestroFlow Core. Let's set up your account.",
      });
      window.history.replaceState({}, document.title, '/subscription');
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
      setTimeout(() => setLocation('/settings'), 2000);
    }
  }, [user, toast, setLocation]);

  const { data: subscription, isLoading: subscriptionLoading, error: subscriptionError } = useQuery<SubscriptionInfo>({
    queryKey: ['/api/subscriptions/current'],
    enabled: !!user,
  });

  const { data: locations } = useQuery<LocationInfo[]>({
    queryKey: ['/api/locations'],
    enabled: !!user,
  });

  const { data: userSubscription } = useQuery<UserInfo>({
    queryKey: ['/api/user/subscription'],
    enabled: !!user,
  });

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest('POST', '/api/subscriptions/cancel', { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription Cancelled", description: "You'll retain access until the end of your billing period." });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions/current'] });
      setShowCancelDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Cancellation Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCheckout = async (plan: 'core') => {
    setCheckoutLoading(plan);
    try {
      const res = await apiRequest('POST', '/api/billing/checkout', { plan });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Billing Not Configured", description: data.message || "Please contact support.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Checkout Failed", description: err.message || "Please try again.", variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageBilling = async () => {
    if (!subscription?.stripeCustomerId) {
      toast({ title: "No Billing Account", description: "Subscribe first to manage billing.", variant: "destructive" });
      return;
    }
    setPortalLoading(true);
    try {
      const res = await apiRequest('POST', '/api/billing/portal', {});
      const data = await res.json();
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        toast({ title: "Portal Unavailable", description: data.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Portal Failed", description: err.message, variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const currentPlan = (subscription?.plan || 'free') as keyof typeof PLAN_FEATURES;
  const planInfo = PLAN_FEATURES[currentPlan] || PLAN_FEATURES.free;
  const ocrUsed = userSubscription?.ocrCreditsUsed || 0;
  const ocrLimit = userSubscription?.ocrCreditsLimit || 5;
  const ocrPct = currentPlan === 'free' ? Math.min(100, (ocrUsed / ocrLimit) * 100) : 0;
  const hrEnabledLocations = locations?.filter(loc => loc.hrAddonEnabled) || [];
  const barEnabledLocations = locations?.filter(loc => loc.barAddonEnabled) || [];
  const locationLimit = currentPlan === 'free' ? 1 : currentPlan === 'core' ? 3 : null;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Card className="w-full max-w-md bg-slate-800/80 border-slate-700/50">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-orange-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Authentication Required</h2>
            <p className="text-slate-300 mb-4">Please log in to view your subscription.</p>
            <Button onClick={() => setLocation('/login')} className="bg-orange-500 hover:bg-orange-600">Log In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscription & Billing</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your plan and payment method</p>
        </div>
        <div className="flex gap-2">
          {subscription?.stripeCustomerId && (
            <Button
              onClick={handleManageBilling}
              disabled={portalLoading}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:text-white"
            >
              {portalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Manage Billing
            </Button>
          )}
        </div>
      </div>

      {subscriptionError && (
        <Alert className="bg-red-900/20 border-red-500/50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-red-200">Failed to load subscription. Please refresh.</AlertDescription>
        </Alert>
      )}

      {subscriptionLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-slate-800/80 border-slate-700/50">
              <CardContent className="p-6"><Skeleton className="h-24 bg-slate-700" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Plan Card */}
          <Card className="lg:col-span-2 bg-slate-800/80 border-slate-700/50">
            <CardHeader>
              <CardTitle className="flex items-center text-white">
                <Settings className="h-5 w-5 mr-2" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Plan Badge */}
              <div className="flex items-center justify-between p-4 bg-slate-700/40 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${planInfo.color} flex items-center justify-center shadow-lg`}>
                    <planInfo.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{planInfo.name} Plan</h3>
                    <p className="text-slate-400 text-sm">
                      {planInfo.price === 0 ? 'Free forever' : `$${planInfo.price}/month`}
                      {subscription?.status === 'past_due' && ' · Past Due'}
                    </p>
                  </div>
                </div>
                <Badge
                  className={
                    subscription?.status === 'active' ? 'bg-green-600' :
                    subscription?.status === 'past_due' ? 'bg-yellow-600' :
                    'bg-slate-600'
                  }
                >
                  {subscription?.status ? subscription.status.replace('_', ' ') : 'Free'}
                </Badge>
              </div>

              {/* Included Features */}
              <div>
                <p className="text-sm font-medium text-slate-400 mb-3">Included features</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {planInfo.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2 text-sm text-slate-300">
                      <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                      {feat}
                    </div>
                  ))}
                </div>
              </div>

              {/* Billing Dates */}
              {subscription?.nextBillingDate && (
                <div className="flex items-center gap-2 text-sm text-slate-400 pt-2 border-t border-slate-700">
                  <Calendar className="h-4 w-4" />
                  Next billing: {new Date(subscription.nextBillingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}

              {/* HR Add-on */}
              {(subscription?.hrAddonLocations ?? 0) > 0 && (
                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-white font-medium">HR Add-on active</span>
                    <span className="text-xs text-slate-400">{hrEnabledLocations.map(l => l.name).join(', ')}</span>
                  </div>
                  <Badge className="bg-blue-600">{subscription?.hrAddonLocations} location{(subscription?.hrAddonLocations ?? 0) > 1 ? 's' : ''}</Badge>
                </div>
              )}

              {/* Bar & Beverage Add-on */}
              {(subscription?.barAddonLocations ?? 0) > 0 && (
                <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">🍸</span>
                    <span className="text-sm text-white font-medium">Bar & Beverage Add-on active</span>
                    <span className="text-xs text-slate-400">{barEnabledLocations.map(l => l.name).join(', ')}</span>
                  </div>
                  <Badge className="bg-purple-600">{subscription?.barAddonLocations} location{(subscription?.barAddonLocations ?? 0) > 1 ? 's' : ''}</Badge>
                </div>
              )}

              {/* Cancel */}
              {currentPlan !== 'free' && (
                <div className="flex justify-end pt-2 border-t border-slate-700">
                  <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-slate-500 hover:text-red-400 hover:bg-red-900/20">
                        <X className="h-3 w-3 mr-1" /> Cancel subscription
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-800 border-slate-700">
                      <DialogHeader>
                        <DialogTitle className="text-white">Cancel Subscription</DialogTitle>
                        <DialogDescription className="text-slate-300">
                          You'll retain access until{' '}
                          {subscription?.nextBillingDate
                            ? new Date(subscription.nextBillingDate).toLocaleDateString()
                            : 'end of period'}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label className="text-white text-sm">Reason (optional)</Label>
                          <Textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Help us improve…"
                            className="bg-slate-700 border-slate-600 text-white mt-1"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setShowCancelDialog(false)} className="border-slate-600 text-slate-300">
                            Keep Plan
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => cancelMutation.mutate(cancelReason)}
                            disabled={cancelMutation.isPending}
                          >
                            {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Cancel Subscription
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar: Usage + Upgrade */}
          <div className="space-y-4">
            {/* Usage */}
            <Card className="bg-slate-800/80 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">OCR Scans</span>
                    <span className="text-white font-medium">
                      {currentPlan === 'free' ? `${ocrUsed} / ${ocrLimit}` : 'Unlimited'}
                    </span>
                  </div>
                  {currentPlan === 'free' && (
                    <Progress value={ocrPct} className="h-2 bg-slate-700" />
                  )}
                  {currentPlan === 'free' && ocrUsed >= ocrLimit && (
                    <p className="text-xs text-red-400 mt-1">Limit reached — upgrade to continue scanning</p>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Locations</span>
                  <span className="text-white">
                    {locations?.length || 0}{locationLimit !== null ? ` / ${locationLimit}` : ''}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">HR Add-on</span>
                  <span className="text-white">{(subscription?.hrAddonLocations ?? 0) > 0 ? `${subscription!.hrAddonLocations} loc.` : 'Inactive'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Bar Add-on</span>
                  <span className="text-white">{(subscription?.barAddonLocations ?? 0) > 0 ? `${subscription!.barAddonLocations} loc.` : 'Inactive'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Upgrade CTA */}
            {currentPlan === 'free' && (
              <Card className="bg-gradient-to-br from-orange-900/30 to-red-900/30 border-orange-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-400" />
                    Upgrade Your Plan
                  </CardTitle>
                  <CardDescription className="text-slate-300 text-xs">
                    Unlock unlimited OCR, more locations, and advanced features
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => handleCheckout('core')}
                    disabled={checkoutLoading === 'core'}
                  >
                    {checkoutLoading === 'core'
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Star className="h-4 w-4 mr-2" />}
                    RestroFlow Core · $179/mo
                  </Button>
                  <Link href="/pricing">
                    <Button variant="ghost" size="sm" className="w-full text-slate-400 hover:text-white text-xs">
                      Compare all plans →
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Enterprise — contact sales */}
            <Card className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-purple-500/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Crown className="h-4 w-4 text-purple-400" />
                  Need Enterprise?
                </CardTitle>
                <CardDescription className="text-slate-300 text-xs">
                  Multi-unit dashboards, custom reporting, and dedicated support — let's build a plan that fits.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => window.open('mailto:sales@restroflow.com?subject=Enterprise%20Plan%20Inquiry', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Contact Sales
                </Button>
              </CardContent>
            </Card>

            {/* Support */}
            <Card className="bg-slate-800/80 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Need help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-slate-600 text-slate-300 hover:text-white"
                  onClick={() => window.open('mailto:support@restroflow.com', '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-2" /> Contact Support
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start border-slate-600 text-slate-300 hover:text-white"
                  onClick={() => window.open('/pricing', '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-2" /> View Plan Comparison
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Plan Comparison */}
      {currentPlan === 'free' && !subscriptionLoading && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.entries(PLAN_FEATURES) as [keyof typeof PLAN_FEATURES, typeof PLAN_FEATURES[keyof typeof PLAN_FEATURES]][]).map(([planId, info]) => (
              <Card
                key={planId}
                className={`border-slate-700/50 ${planId === currentPlan ? 'bg-slate-700/60 border-orange-500/50' : 'bg-slate-800/60'}`}
              >
                <CardHeader className="pb-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${info.color} flex items-center justify-center mb-2`}>
                    <info.icon className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    {info.name}
                    {planId === currentPlan && <Badge className="bg-orange-500 text-xs">Current</Badge>}
                  </CardTitle>
                  <CardDescription className="text-slate-300 font-semibold text-lg">
                    {info.price === 0 ? 'Free' : `$${info.price}/mo`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 mb-4">
                    {info.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2 text-sm text-slate-300">
                        <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  {planId === 'core' && (
                    <Button
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={() => handleCheckout(planId as 'core')}
                      disabled={checkoutLoading === planId}
                      size="sm"
                    >
                      {checkoutLoading === planId
                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        : <TrendingUp className="h-3 w-3 mr-1" />}
                      Upgrade to {info.name}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {/* Enterprise — contact us */}
            <Card className="border-slate-700/50 bg-slate-800/60">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-2">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-white text-base">Enterprise</CardTitle>
                <CardDescription className="text-slate-300 font-semibold text-lg">Custom pricing</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 mb-4">
                  {['Unlimited locations', 'HR & employee management', 'Payroll integration', 'Priority support', 'Custom reports', 'Multi-unit dashboard'].map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm text-slate-300">
                      <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => window.open('mailto:sales@restroflow.com?subject=Enterprise%20Plan%20Inquiry', '_blank')}
                  size="sm"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Contact Us
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
