import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { VariationPreviewContent } from "@/components/variations/VariationPreviewContent";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLoading, PortalError } from "@/components/portal/PortalStateBoundary";

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
    return <PortalLoading message="Loading variation…" />;
  }

  if (error || !data) {
    return (
      <PortalError
        title="Link not found"
        description="This variation link is invalid or has expired. Please contact your builder for a new link."
      />
    );
  }

  const companySettings = data.company
    ? { brandColor: (data.company as any).brandColor || "#A890D4" }
    : null;

  return (
    <PortalLayout
      title="Variation"
      subtitle={data.company?.name}
      maxWidth="max-w-4xl"
    >
      <div className="shadow-lg rounded-xl overflow-hidden bg-white">
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
    </PortalLayout>
  );
}
