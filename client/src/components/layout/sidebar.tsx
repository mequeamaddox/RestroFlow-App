import { useState } from "react";
import { Link, useLocation as useWouterLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/contexts/LocationContext";
import { usePermissions } from "@/contexts/PermissionContext";
import { Permission } from "@/contexts/PermissionContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  LayoutDashboard, 
  Package, 
  ChefHat, 
  ShoppingCart, 
  Building2, 
  BarChart3, 
  Trash2, 
  Settings,
  Menu,
  X,
  Utensils,
  CreditCard,
  MapPin,
  FileText,
  TrendingUp,
  Target,
  Activity,
  Bot,
  Brain,
  Users,
  Calendar,
  CheckSquare,
  Clock,
  MessageSquare,
  UserCircle,
  Home,
  BookOpen,
  Building,
  Briefcase,
  Calculator,
  Crown,
  Star,
  Shield,
  Martini
} from "lucide-react";
import { cn } from "@/lib/utils";
import logoImg from "@assets/IMG_20250812_004328_1754973838131.png";

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Food Recipes', href: '/recipes', icon: ChefHat },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart },
  { name: 'Vendors', href: '/vendors', icon: Building2 },
  { name: 'Invoice Processing', href: '/invoice-processing', icon: FileText, badge: 'OCR' },
  { name: 'Analytics & Reports', href: '/analytics', icon: BarChart3, badge: 'LIVE' },
  { name: 'Waste Tracking', href: '/waste-tracking', icon: Trash2 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const barNavigation = [
  { name: 'Bar Dashboard', href: '/bar/dashboard', icon: BarChart3, badge: 'ADD-ON' },
  { name: 'Beverage Menu', href: '/beverage-menu', icon: Martini },
  { name: 'Beverage Costing', href: '/beveragecost', icon: Calculator },
  { name: 'Inventory Counts', href: '/bar/inventory', icon: Package },
  { name: 'Waste Log', href: '/bar/waste-log', icon: Trash2 },
  { name: 'Bar Purchase Orders', href: '/bar/purchase-orders', icon: ShoppingCart },
];

// Subscription & Billing navigation for owners
const subscriptionNavigation = [
  { name: 'Subscription', href: '/subscription', icon: Crown, badge: 'BILLING' },
];

const hrNavigation = [
  { name: 'HR Dashboard', href: '/hr/dashboard', icon: Users, badge: 'ADD-ON' },
  { name: 'Employees', href: '/hr/employees', icon: Users },
  { name: 'Departments', href: '/hr/departments', icon: Building },
  { name: 'Positions', href: '/hr/positions', icon: Briefcase },
  { name: 'Documents & Onboarding', href: '/hr/documents', icon: FileText },
  { name: 'Analytics', href: '/hr/analytics', icon: BarChart3, badge: 'LIVE' },
  { name: 'Scheduling', href: '/hr/scheduling', icon: Calendar },
  { name: 'Time Clock', href: '/hr/time-clock', icon: Clock },
  { name: 'Time Off', href: '/hr/time-off', icon: Calendar },
  { name: 'Tasks', href: '/hr/tasks', icon: CheckSquare },
  { name: 'Messaging', href: '/hr/messaging', icon: MessageSquare },
];

const employeeNavigation = [
  { name: 'My Dashboard', href: '/employee/dashboard', icon: Home },
  { name: 'My Documents', href: '/employee/documents', icon: FileText },
  { name: 'Company Handbook', href: '/employee/handbook', icon: BookOpen },
  { name: 'Build Sheets', href: '/employee/build-sheets', icon: ChefHat },
  { name: 'Messages', href: '/employee/messages', icon: MessageSquare },
  { name: 'My Schedule', href: '/employee/schedule', icon: Calendar },
  { name: 'Time Clock', href: '/employee/time-clock', icon: Clock },
  { name: 'Request Time Off', href: '/employee/time-off', icon: Calendar },
];

interface SidebarProps {
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;
}

export default function Sidebar({ isMobileMenuOpen = false, setIsMobileMenuOpen }: SidebarProps = {}) {
  const [currentPath] = useWouterLocation();
  const [internalMobileMenuOpen, setInternalMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const { signOut } = useClerk();
  const { currentLocation, setCurrentLocation, locations, isLoading, hasBarAccess } = useLocation();
  const { hasPermission } = usePermissions();
  
  // Get employee profile data for position title
  const userId = (user as any)?.id || (user as any)?.claims?.sub;
  const isEmployee = (user as any)?.role === 'employee';
  const isPlatformAdmin = (user as any)?.role === 'platform_admin';
  const isOwner = (user as any)?.role === 'owner' || isPlatformAdmin;
  const { data: employeeProfile } = useQuery({
    queryKey: [`/api/employees/${userId}/profile`],
    enabled: !!userId && isEmployee,
  });
  const isHREnabled = hasPermission(Permission.VIEW_ALL_EMPLOYEES) || hasPermission(Permission.MANAGE_EMPLOYEES);
  
  // Use external state if provided, otherwise use internal state
  const mobileMenuOpen = isMobileMenuOpen || internalMobileMenuOpen;
  const setMobileMenuOpen = setIsMobileMenuOpen || setInternalMobileMenuOpen;

  return (
    <>
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed left-0 top-0 h-full w-64 bg-slate-800/95 backdrop-blur-sm border-r border-slate-700/50 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto flex flex-col",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center mb-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 mr-3 shadow-lg">
              <Utensils className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">RestroFlow</h1>
              <p className="text-sm text-slate-300">Inventory Management</p>
            </div>
          </div>
          
          {/* Location Switcher - Hidden for employees */}
          {!isEmployee && (
            <div className="space-y-2">
              <div className="flex items-center text-xs font-medium text-slate-400 uppercase tracking-wide">
                <MapPin className="h-3 w-3 mr-1" />
                Current Location
              </div>
              <Select 
                value={currentLocation?.id || ""} 
                onValueChange={(value) => {
                  const location = locations.find(loc => loc.id === value);
                  if (location) setCurrentLocation(location);
                }}
                disabled={isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      <div className="flex items-center">
                        <div className={cn(
                          "w-2 h-2 rounded-full mr-2",
                          location.type === 'restaurant' ? 'bg-blue-500' : 
                          location.type === 'bar' ? 'bg-purple-500' : 'bg-gray-500'
                        )}></div>
                        {location.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="mt-6 flex-1 overflow-y-auto pb-20">
          {/* Employee Self-Service Portal - Only show for employees */}
          {isEmployee && (
            <div className="mb-6">
              <div className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                My Workspace
              </div>
              <ul className="space-y-1">
                {employeeNavigation.map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;
                  
                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200 cursor-pointer rounded-r-2xl mr-4",
                            isActive && "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-r-4 border-green-400 text-white"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon className="h-5 w-5 mr-3" />
                          <span className="flex-1">{item.name}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          
          {/* Core Platform - Show limited view for employees, full view for managers+ */}
          {!isEmployee && (
            <div className="mb-6">
              <div className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Core Platform
              </div>
              <ul className="space-y-1">
                {navigation.map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;
                  
                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200 cursor-pointer rounded-r-2xl mr-4",
                            isActive && "bg-gradient-to-r from-orange-500/20 to-red-500/20 border-r-4 border-orange-400 text-white"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon className="h-5 w-5 mr-3" />
                          <span className="flex-1">{item.name}</span>
                          {(item as any).badge && (
                            <span className={cn(
                              "ml-2 px-2 py-0.5 text-xs font-bold rounded-full",
                              (item as any).badge === 'LIVE' ? "bg-green-500/20 text-green-400" :
                              (item as any).badge === 'AI' ? "bg-purple-500/20 text-purple-400" :
                              (item as any).badge === 'AUTO' ? "bg-blue-500/20 text-blue-400" :
                              "bg-orange-500/20 text-orange-400"
                            )}>
                              {(item as any).badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Bar & Beverage Add-on - Only show when enabled for this location */}
          {hasBarAccess && !isEmployee && (
            <div className="mb-6">
              <div className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Bar & Beverage Add-on
              </div>
              <ul className="space-y-1">
                {barNavigation.map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;

                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200 cursor-pointer rounded-r-2xl mr-4",
                            isActive && "bg-gradient-to-r from-purple-500/20 to-violet-500/20 border-r-4 border-purple-400 text-white"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon className="h-5 w-5 mr-3" />
                          <span className="flex-1">{item.name}</span>
                          {(item as any).badge && (
                            <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-purple-500/20 text-purple-400">
                              {(item as any).badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* HR Employee Management Add-on - Only show for users with HR permissions */}
          {isHREnabled && (
            <div>
              <div className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Employee Management Add-on
              </div>
              <ul className="space-y-1">
                {hrNavigation.map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;
                  
                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200 cursor-pointer rounded-r-2xl mr-4",
                            isActive && "bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border-r-4 border-blue-400 text-white"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon className="h-5 w-5 mr-3" />
                          <span className="flex-1">{item.name}</span>
                          {(item as any).badge && (
                            <span className={cn(
                              "ml-2 px-2 py-0.5 text-xs font-bold rounded-full",
                              (item as any).badge === 'ADD-ON' ? "bg-blue-500/20 text-blue-400" :
                              (item as any).badge === 'LIVE' ? "bg-green-500/20 text-green-400" :
                              "bg-gray-500/20 text-gray-400"
                            )}>
                              {(item as any).badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Platform Admin Section */}
          {isPlatformAdmin && (
            <div className="mb-6">
              <div className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <div className="flex items-center gap-2">
                  <Shield className="h-3 w-3 text-red-400" />
                  <span className="text-red-400">Platform Admin</span>
                </div>
              </div>
              <ul className="space-y-1">
                {[{ name: 'Platform Settings', href: '/platform/settings', icon: Shield }].map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200 cursor-pointer rounded-r-2xl mr-4",
                            isActive && "bg-gradient-to-r from-red-500/20 to-pink-500/20 border-r-4 border-red-400 text-white"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon className="h-5 w-5 mr-3" />
                          <span className="flex-1">{item.name}</span>
                          <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500/20 text-red-400">ADMIN</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Subscription & Billing - Only show for owners */}
          {isOwner && (
            <div className="mb-6">
              <div className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Subscription & Billing
              </div>
              <ul className="space-y-1">
                {subscriptionNavigation.map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.name}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-all duration-200 cursor-pointer rounded-r-2xl mr-4",
                            isActive && "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-r-4 border-yellow-400 text-white"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <Icon className="h-5 w-5 mr-3" />
                          <span className="flex-1">{item.name}</span>
                          {(item as any).badge && (
                            <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-yellow-500/20 text-yellow-400">
                              {(item as any).badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </nav>

        {/* User Profile */}
        <div className="mt-auto p-4 border-t border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {(user as any)?.firstName ? (user as any).firstName.charAt(0) : (user as any)?.email?.charAt(0) || 'U'}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {(user as any)?.firstName || (user as any)?.email || 'User'}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {isEmployee ? ((employeeProfile as any)?.employee?.position?.title || 'Staff') : ((user as any)?.role || 'Staff')} {isEmployee && '• Employee Portal'}
              </p>
            </div>
            <Link href={isEmployee ? "/employee/settings" : "/settings"}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(false)}
                className="ml-2 text-slate-400 hover:text-white hover:bg-slate-700/50"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          
          {/* Logout Button */}
          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  // Sign out from Clerk
                  await signOut();
                  
                  // Clear backend session cookie
                  await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                  });
                  
                  // Redirect to auth page
                  window.location.href = '/auth';
                } catch (error) {
                  console.error('Logout error:', error);
                  // Even if there's an error, redirect to auth
                  window.location.href = '/auth';
                }
              }}
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}