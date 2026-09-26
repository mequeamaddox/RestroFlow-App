import { useState, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useUser, useClerk } from "@clerk/clerk-react";
import { LocationProvider } from "@/contexts/LocationContext";
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
import Header from "@/components/layout/header";
import MobileBottomNav from "@/components/layout/mobile-bottom-nav";

function AuthFailureDiag() {
  const [diag, setDiag] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const { isSignedIn } = useUser();
  const { signOut } = useClerk();
  const { refreshAuth } = useAuth();

  const [meResult, setMeResult] = useState<{ status: number; body: any } | null>(null);

  useEffect(() => {
    fetch('/api/auth/diag').then(r => r.json()).then(setDiag).catch(() => {});
    // Also probe /api/auth/me directly with cookie auth to see the exact failure
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(async r => setMeResult({ status: r.status, body: await r.json().catch(() => ({})) }))
      .catch(e => setMeResult({ status: 0, body: { error: String(e) } }));
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refreshAuth();
    } finally {
      // Force a full reload so all hooks reinitialise with the latest session state
      window.location.reload();
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div style={{ background: '#1e293b', border: '1px solid #ef4444', borderRadius: 12, padding: '2rem', maxWidth: 520, width: '100%', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Login issue — could not load your account
        </div>
        <p style={{ color: '#cbd5e1', marginBottom: '1rem', lineHeight: 1.6, fontSize: '0.9rem' }}>
          Clerk says you're signed in, but the server couldn't verify your session.
          Check your Railway Variables tab — <code style={{ color: '#f472b6' }}>CLERK_SECRET_KEY</code> must be set.
        </p>
        {diag && (
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '0.875rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
            <p style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '0.5rem' }}>Server diagnostic:</p>
            <ul style={{ color: '#94a3b8', paddingLeft: '1rem', lineHeight: 2 }}>
              <li>publishableKey type: <b style={{ color: diag.pk === 'missing' ? '#ef4444' : '#4ade80' }}>{diag.pk}</b></li>
              <li>secretKey type: <b style={{ color: diag.sk === 'missing' ? '#ef4444' : '#4ade80' }}>{diag.sk}</b></li>
              <li>keys match: <b style={{ color: diag.pkSk_match ? '#4ade80' : '#ef4444' }}>{String(diag.pkSk_match)}</b></li>
              <li>bearer token: <b style={{ color: diag.bearer === 'present' ? '#4ade80' : '#ef4444' }}>{diag.bearer}</b></li>
              <li>clerk userId: <b style={{ color: diag.clerkUserId ? '#4ade80' : '#ef4444' }}>{diag.clerkUserId ?? 'null'}</b></li>
              <li>db host: <b style={{ color: diag.dbHost && diag.dbHost !== 'unset' ? '#4ade80' : '#ef4444' }}>{diag.dbHost ?? 'unset'}</b></li>
            </ul>
          </div>
        )}
        {meResult && (
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '0.875rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
            <p style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '0.5rem' }}>/api/auth/me (cookie auth):</p>
            <p style={{ color: meResult.status === 200 ? '#4ade80' : '#ef4444', fontWeight: 700 }}>HTTP {meResult.status}</p>
            <p style={{ color: '#94a3b8', wordBreak: 'break-all' }}>{JSON.stringify(meResult.body)}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={handleRetry} disabled={retrying} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem', opacity: retrying ? 0.7 : 1 }}>
            {retrying ? 'Retrying...' : 'Try again'}
          </button>
          {isSignedIn && (
            <button onClick={handleSignOut} style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem' }}>
              Sign out & retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Router() {
  // Always call useState hooks first to maintain consistent order
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isSignedIn, isLoaded: clerkLoaded } = useUser();

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

  // Clerk says signed in but backend couldn't verify — show helpful diagnostics
  if (clerkLoaded && isSignedIn && !isAuthenticated) {
    return <AuthFailureDiag />;
  }

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
                  // Redirect owners to onboarding until they complete it
                  if (isOwner && onboardingProgress && !onboardingProgress.isCompleted) {
                    return <Redirect to="/onboarding" />;
                  }
                  return <Dashboard />;
                }} />
                <Route path="/inventory" component={Inventory} />
                <Route path="/recipes" component={Recipes} />
                <Route path="/beverage-menu" component={BeverageMenu} />
                <Route path="/vendors" component={Vendors} />
                <Route path="/purchase-orders" component={PurchaseOrders} />
                <Route path="/waste-tracking" component={WasteTracking} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/invoice-processing" component={InvoiceProcessing} />
                <Route path="/multi-unit-dashboard" component={MultiUnitDashboard} />
                <Route path="/subscription" component={Subscription} />
                <Route path="/pricing" component={Pricing} />
                {/* Hidden owner-only prototype routes */}
                <Route path="/bluetooth-scale-prototype" component={BluetoothScalePrototype} />
                <Route path="/beveragecost" component={BeverageCost} />
                {/* Bar & Beverage Add-on Routes */}
                <Route path="/bar/dashboard" component={BarDashboard} />
                <Route path="/bar/inventory" component={BarInventory} />
                <Route path="/bar/waste-log" component={BarWasteLog} />
                <Route path="/bar/purchase-orders" component={BarPurchaseOrders} />
                <Route path="/settings" component={Settings} />
                {/* HR Employee Management Add-on Routes */}
                <Route path="/hr/dashboard" component={HRDashboard} />
                <Route path="/hr/employees" component={HREmployees} />
                <Route path="/employees" component={HREmployees} />
                <Route path="/employees/:id" component={EmployeeProfile} />
                <Route path="/hr/analytics" component={HRAnalytics} />
                <Route path="/hr/time-clock" component={HRTimeClock} />
                <Route path="/hr/tasks" component={HRTasks} />
                <Route path="/hr/messaging" component={HRMessaging} />
                <Route path="/hr/scheduling" component={HRScheduling} />
                <Route path="/hr/time-off" component={HRTimeOff} />
                <Route path="/hr/departments" component={HRDepartments} />
                <Route path="/hr/positions" component={HRPositions} />
                <Route path="/hr/documents" component={HRDocuments} />
                <Route path="/hr/invitations" component={HRInvitations} />
                {/* Employee Self-Service Portal Routes */}
                <Route path="/employee/dashboard" component={EmployeeDashboard} />
                <Route path="/employee/documents" component={EmployeeDocuments} />
                <Route path="/employee/handbook" component={EmployeeHandbook} />
                <Route path="/employee/build-sheets" component={EmployeeBuildSheets} />
                <Route path="/employee/messages" component={EmployeeMessages} />
                <Route path="/employee/time-clock" component={EmployeeTimeClock} />
                <Route path="/employee/timeclock" component={EmployeeTimeClock} />
                <Route path="/employee/schedule" component={EmployeeSchedule} />
                <Route path="/employee/time-off" component={EmployeeTimeOff} />
                <Route path="/employee/settings" component={EmployeeSettings} />
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
