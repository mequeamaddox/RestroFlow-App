import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
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

function Router() {
  // Always call useState hooks first to maintain consistent order
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();

  // Always call hooks in the same order, handle conditions in JSX
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
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
                  // Route employees to their dashboard, others to admin dashboard
                  return user?.role === 'employee' ? <EmployeeDashboard /> : <Dashboard />;
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
