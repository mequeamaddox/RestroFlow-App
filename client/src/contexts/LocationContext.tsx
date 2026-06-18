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
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [currentLocation, setCurrentLocationState] = useState<Location | null>(null);
  const { user } = useAuth();

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  // Set first location as default when locations are loaded
  useEffect(() => {
    if (locations.length > 0 && !currentLocation) {
      setCurrentLocationState(locations[0]);
    }
  }, [locations, currentLocation]);

  const setCurrentLocation = (location: Location) => {
    setCurrentLocationState(location);
    localStorage.setItem('selectedLocation', JSON.stringify(location));
  };

  // Load saved location from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('selectedLocation');
    if (saved) {
      try {
        const location = JSON.parse(saved);
        setCurrentLocationState(location);
      } catch (error) {
        console.error('Error loading saved location:', error);
      }
    }
  }, []);

  // Owners and platform_admin always have access; others need HR add-on enabled on the location
  const hasHRAccess = user?.role === 'owner' || user?.role === 'platform_admin' || currentLocation?.hrAddonEnabled || false;

  return (
    <LocationContext.Provider value={{
      currentLocation,
      setCurrentLocation,
      locations,
      isLoading,
      hasHRAccess
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