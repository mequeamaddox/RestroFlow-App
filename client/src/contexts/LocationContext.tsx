import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Location } from "@shared/schema";

interface LocationContextType {
  currentLocation: Location | null;
  setCurrentLocation: (location: Location) => void;
  locations: Location[];
  isLoading: boolean;
  hasHRAccess: boolean;
  hasBarAccess: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [currentLocation, setCurrentLocationState] = useState<Location | null>(null);
  const { user } = useAuth();

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  // When the logged-in user changes (login/logout/switch), clear the stored
  // location so a different user doesn't inherit the previous user's selection.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    try {
      const storedUserId = localStorage.getItem('restroflow_user_id');
      if (storedUserId !== userId) {
        localStorage.removeItem('selectedLocation');
        localStorage.setItem('restroflow_user_id', userId);
        setCurrentLocationState(null);
      }
    } catch (error) {
      // localStorage unavailable (private browsing, etc.) — ignore
    }
  }, [user?.id]);

  // Set first location as default when locations are loaded
  useEffect(() => {
    if (locations.length > 0 && !currentLocation) {
      setCurrentLocationState(locations[0]);
    }
  }, [locations, currentLocation]);

  const setCurrentLocation = (location: Location) => {
    setCurrentLocationState(location);
    try {
      localStorage.setItem('selectedLocation', JSON.stringify(location));
    } catch (error) {
      // ignore
    }
  };

  // Load saved location from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selectedLocation');
      if (saved) {
        const location = JSON.parse(saved);
        setCurrentLocationState(location);
      }
    } catch (error) {
      console.error('Error loading saved location:', error);
    }
  }, []);

  // Only platform_admin bypasses add-on checks; owners and all others need the add-on enabled on the location
  const hasHRAccess = user?.role === 'platform_admin' || currentLocation?.hrAddonEnabled || false;
  const hasBarAccess = user?.role === 'platform_admin' || (currentLocation as any)?.barAddonEnabled || false;

  return (
    <LocationContext.Provider value={{
      currentLocation,
      setCurrentLocation,
      locations,
      isLoading,
      hasHRAccess,
      hasBarAccess,
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}