import { useQuery } from "@tanstack/react-query";
import type { CompanySettings } from "@shared/schema";

export function useWeekStartDay(): 0 | 1 {
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
    staleTime: 5 * 60 * 1000,
  });

  return (companySettings?.weekStartDay === 0 ? 0 : 1) as 0 | 1;
}
