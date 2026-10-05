import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useLocation } from '@/contexts/LocationContext';
export function useEmployeeIdentity() {
  const {user} = useAuth();
  const {currentLocation} = useLocation();
  const query = useQuery<{id:string;locationId:string}>({
    queryKey: ['/api/employees/me/identity', currentLocation?.id, user?.id],
    enabled: !!user?.id && !!currentLocation?.id,
  });
  return {...query,employeeId:query.data?.id,locationId:currentLocation?.id};
}
