import { useQuery } from "@tanstack/react-query";
import type { FieldOption } from "@shared/schema";

export function useDefectTradeOptions() {
  const { data } = useQuery<FieldOption[]>({
    queryKey: ["/api/field-options/defect.trade"],
  });

  return data?.map((option) => ({
    value: option.key,
    label: option.name,
    color: option.color || "000000",
  })) || [];
}
