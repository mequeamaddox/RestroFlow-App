import React, { createContext, useContext, useState } from 'react';

interface LocationState {
  locationId: string | null;
  locationName: string | null;
  setLocation: (id: string, name: string) => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);

  function setLocation(id: string, name: string) {
    setLocationId(id);
    setLocationName(name);
  }

  function clearLocation() {
    setLocationId(null);
    setLocationName(null);
  }

  return (
    <LocationContext.Provider value={{ locationId, locationName, setLocation, clearLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useSelectedLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useSelectedLocation must be used inside LocationProvider');
  return ctx;
}
