import { useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { LocationProvider, useLocation as useLocationCtx } from "@/contexts/LocationContext";
import { PermissionProvider } from "@/contexts/PermissionContext";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Pricing from "@/pages/pricing";
import Subscription from "@/pages/subscription";
import Auth from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Recipes from "@/pages/recipes";
import Vendors from "@/pages/vendors";
import PurchaseOrders from "@/pages/purchase-orders";
import WasteTracking from "@/pages/waste-tracking";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import InvoiceProcessing from "@/pages/invoice-processing";
import HRDashboard from "@/pages/hr-dashboard";
import HREmployees from "@/pages/hr-employees";
import HRAnalytics from "@/pages/hr-analytics";
import HRTimeClock from "@/pages/hr-time-clock";
import HRTasks from "@/pages/hr-tasks";
import HRMessaging from "@/pages/hr-messaging";
import HRScheduling from "@/pages/hr-scheduling";
import HRTimeOff from "@/pages/hr-time-off";
import HRDepartments from "@/pages/hr-departments";
import HRPositions from "@/pages/hr-positions";
import HRDocuments from "@/pages/hr-documents";
import HRInvitations from "@/pages/hr-invitations";
import EmployeeProfile from "@/pages/employee-profile";
import EmployeeDashboard from "@/pages/employee-dashboard";
import EmployeeDocuments from "@/pages/employee-documents";
import EmployeeMessages from "@/pages/employee-messages";
import EmployeeTimeClock from "@/pages/employee-time-clock";
import EmployeeSchedule from "@/pages/employee-schedule";
import EmployeeSettings from "@/pages/employee-settings";
import EmployeeHandbook from "@/pages/employee-handbook";
import EmployeeBuildSheets from "@/pages/employee-build-sheets";
import EmployeeTimeOff from "@/pages/employee-time-off";
import PublicOnboarding from "@/pages/public-onboarding";
import Onboarding from "@/pages/onboarding";
import InvitationAccept from "@/pages/invitation-accept";
import MultiUnitDashboard from "@/pages/multi-unit-dashboard";
import BluetoothScalePrototype from "@/pages/bluetooth-scale-prototype";
import BeverageCost from "@/pages/beveragecost";
import BeverageMenu from "@/pages/beveragemenu";
import BarDashboard from "@/pages/bar-dashboard";
import BarInventory from "@/pages/bar-inventory";
import BarWasteLog from "@/pages/bar-waste-log";
import BarPurchaseOrders from "@/pages/bar-purchase-orders";
import PlatformSettings from "@/pages/platform-settings";
import Sidebar from "@/components/layout/sidebar";
import { FeatureNotIncluded, useIsPayer } from "@/components/subscription/feature-not-included";
import Header from "@/components/layout/header";
import MobileBottomNav from "@/components/layout/mobile-bottom-nav";

function HRGuard({ component: Component }: { component: React.ComponentType }) {
  const { hasHRAccess } = useLocationCtx();
  const isPayer = useIsPayer();
  if (!hasHRAccess) return isPayer ? <Redirect to="/subscription" /> : <FeatureNotIncluded feature="HR" />;
  return <Component />;
}

// Billing and pricing belong to the account owner; staff never see them.
function PayerOnly({ component: Component }: { component: React.ComponentType }) {
  return useIsPayer() ? <Component /> : <Redirect to="/" />;
}

function OnboardingGuard({
  component: Component,
  isOwner,
  onboardingProgress,
}: {
  component: React.ComponentType;
  isOwner: boolean;
  onboardingProgress: { isCompleted: boolean } | undefined;
}) {
  if (isOwner && onboardingProgress && !onboardingProgress.isCompleted) {
    return <Redirect to="/onboarding" />;
  }
  return <Component />;
}

// Paths an unsubscribed owner is still allowed to visit
const SUBSCRIPTION_FREE_PATHS = ['/subscription', '/pricing', '/onboarding', '/settings', '/platform', '/login'];

function Router() {
  // Always call useState hooks first to maintain consistent order
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentPath] = useLocation();

  const isOwner = user?.role === 'owner';
  const { data: onboardingProgress } = useQuery<{ isCompleted: boolean }>({
    queryKey: ['/api/owner-onboarding/progress'],
    enabled: isAuthenticated && isOwner,
    staleTime: 60_000,
  });

  // Always call hooks in the same order, handle conditions in JSX
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Profile paperwork links work for signed-in staff as well as new accounts.
  if (currentPath.startsWith('/onboarding/')) return <Switch><Route path="/onboarding/:token" component={PublicOnboarding} /></Switch>;

  // Keep invitations reachable after modal sign-in, including existing accounts.
  if (currentPath.startsWith('/invitation/accept/')) return <Switch><Route path="/invitation/accept/:token" component={InvitationAccept} /></Switch>;

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/landing" component={Landing} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/onboarding/:token" component={PublicOnboarding} />
        <Route path="/invitation/accept/:token" component={InvitationAccept} />
        <Route path="/login" component={Auth} />
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // Owners without an active subscription are gated to subscription/settings/onboarding only
  const hasActiveSubscription = ['active', 'past_due'].includes(user?.subscriptionStatus || '');
  const isSubscriptionFreePath = SUBSCRIPTION_FREE_PATHS.some(p => currentPath.startsWith(p));

  if (isOwner && !hasActiveSubscription && !isSubscriptionFreePath) {
    return <Redirect to="/subscription" />;
  }

  return (
    <LocationProvider>
      <PermissionProvider>
        <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-32 h-32 rounded-full bg-orange-400 blur-3xl"></div>
          <div className="absolute top-40 right-32 w-24 h-24 rounded-full bg-green-400 blur-2xl"></div>
          <div className="absolute bottom-32 left-1/3 w-40 h-40 rounded-full bg-yellow-400 blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-28 h-28 rounded-full bg-red-400 blur-2xl"></div>
        </div>
        
        <div className="relative z-10 flex w-full">
          <Sidebar 
            isMobileMenuOpen={isMobileMenuOpen} 
            setIsMobileMenuOpen={setIsMobileMenuOpen} 
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
            <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
              <Switch>
                {/* Owner Onboarding Route - Must be accessible to owners only */}
                <Route path="/onboarding" component={() => {
                  // Allow owners and platform_admin to access onboarding
                  if (!['owner', 'platform_admin'].includes(user?.role ?? '')) {
                    return <NotFound />;
                  }
                  return <Onboarding />;
                }} />
                
                <Route path="/" component={() => {
                  if (user?.role === 'employee') return <EmployeeDashboard />;
                  if (isOwner && onboardingProgress && !onboardingProgress.isCompleted) {
                    return <Redirect to="/onboarding" />;
                  }
                  return <Dashboard />;
                }} />
                <Route path="/inventory">{() => <OnboardingGuard component={Inventory} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/recipes">{() => <OnboardingGuard component={Recipes} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/beverage-menu">{() => <OnboardingGuard component={BeverageMenu} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/vendors">{() => <OnboardingGuard component={Vendors} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/purchase-orders">{() => <OnboardingGuard component={PurchaseOrders} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/waste-tracking">{() => <OnboardingGuard component={WasteTracking} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/analytics">{() => <OnboardingGuard component={Analytics} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/invoice-processing">{() => <OnboardingGuard component={InvoiceProcessing} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/multi-unit-dashboard">{() => <OnboardingGuard component={MultiUnitDashboard} isOwner={isOwner} onboardingProgress={onboardingProgress} />}</Route>
                <Route path="/subscription">{() => <PayerOnly component={Subscription} />}</Route>
                <Route path="/pricing">{() => <PayerOnly component={Pricing} />}</Route>
                {/* Hidden owner-only prototype routes */}
                <Route path="/bluetooth-scale-prototype" component={BluetoothScalePrototype} />
                <Route path="/beveragecost" component={BeverageCost} />
                {/* Bar & Beverage Add-on Routes */}
                <Route path="/bar/dashboard" component={BarDashboard} />
                <Route path="/bar/inventory" component={BarInventory} />
                <Route path="/bar/waste-log" component={BarWasteLog} />
                <Route path="/bar/purchase-orders" component={BarPurchaseOrders} />
                <Route path="/settings" component={Settings} />
                {/* HR Employee Management Add-on Routes — require HR subscription */}
                <Route path="/hr/dashboard">{() => <HRGuard component={HRDashboard} />}</Route>
                <Route path="/hr/employees">{() => <HRGuard component={HREmployees} />}</Route>
                <Route path="/employees">{() => <HRGuard component={HREmployees} />}</Route>
                <Route path="/employees/:id">{() => <HRGuard component={EmployeeProfile} />}</Route>
                <Route path="/hr/analytics">{() => <HRGuard component={HRAnalytics} />}</Route>
                <Route path="/hr/time-clock">{() => <HRGuard component={HRTimeClock} />}</Route>
                <Route path="/hr/tasks">{() => <HRGuard component={HRTasks} />}</Route>
                <Route path="/hr/messaging">{() => <HRGuard component={HRMessaging} />}</Route>
                <Route path="/hr/scheduling">{() => <HRGuard component={HRScheduling} />}</Route>
                <Route path="/hr/time-off">{() => <HRGuard component={HRTimeOff} />}</Route>
                <Route path="/hr/departments">{() => <HRGuard component={HRDepartments} />}</Route>
                <Route path="/hr/positions">{() => <HRGuard component={HRPositions} />}</Route>
                <Route path="/hr/documents">{() => <HRGuard component={HRDocuments} />}</Route>
                <Route path="/hr/invitations" component={HRInvitations} />
                {/* Employee Self-Service Portal Routes — require HR addon */}
                <Route path="/employee/dashboard">{() => <HRGuard component={EmployeeDashboard} />}</Route>
                <Route path="/employee/documents">{() => <HRGuard component={EmployeeDocuments} />}</Route>
                <Route path="/employee/handbook">{() => <HRGuard component={EmployeeHandbook} />}</Route>
                <Route path="/employee/build-sheets">{() => <HRGuard component={EmployeeBuildSheets} />}</Route>
                <Route path="/employee/messages">{() => <HRGuard component={EmployeeMessages} />}</Route>
                <Route path="/employee/time-clock">{() => <HRGuard component={EmployeeTimeClock} />}</Route>
                <Route path="/employee/timeclock">{() => <HRGuard component={EmployeeTimeClock} />}</Route>
                <Route path="/employee/schedule">{() => <HRGuard component={EmployeeSchedule} />}</Route>
                <Route path="/employee/time-off">{() => <HRGuard component={EmployeeTimeOff} />}</Route>
                <Route path="/employee/settings">{() => <HRGuard component={EmployeeSettings} />}</Route>
                {/* Platform Admin Routes */}
                <Route path="/platform/settings" component={PlatformSettings} />
                <Route path="/login"><Redirect to="/" /></Route>
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
          
          {/* Mobile Bottom Navigation */}
          <MobileBottomNav onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
        </div>
      </div>
      </PermissionProvider>
    </LocationProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
