import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { VariationPreviewContent } from "@/components/variations/VariationPreviewContent";

export default function VariationPortal() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{
    variation: any;
    items: any[];
    bills: any[];
    timesheets: any[];
    project: any;
    company: any;
  }>({
    queryKey: ["/api/portal/variation", token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/variation/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load variation");
      }
      return res.json();
    },
    enabled: !!token,
  });

  const handleSigned = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/portal/variation", token] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Loading variation...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm px-4">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <h1 className="text-lg font-semibold">Link not found</h1>
          <p className="text-sm text-gray-500">
            This variation link is invalid or has expired. Please contact your builder for a new link.
          </p>
        </div>
      </div>
    );
  }

  const companySettings = data.company
    ? { brandColor: (data.company as any).brandColor || "#6d28d9" }
    : null;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="shadow-lg rounded-xl overflow-hidden bg-white max-w-4xl mx-auto">
        <VariationPreviewContent
          variation={data.variation}
          items={data.items}
          bills={data.bills}
          company={data.company}
          companySettings={companySettings}
          project={data.project}
          mode="portal"
          portalToken={token}
          onSigned={handleSigned}
        />
      </div>
    </div>
  );
}
