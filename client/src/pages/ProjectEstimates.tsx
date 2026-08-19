import { useParams } from "wouter";
import EstimatesView from "@/components/estimates/EstimatesView";

interface ProjectEstimatesParams {
  projectId: string;
}

/** One project's estimates. Same view as the cross-project list, scoped. */
export default function ProjectEstimates({ embedded }: { embedded?: boolean } = {}) {
  const { projectId } = useParams<ProjectEstimatesParams>();

  if (!projectId) {
    return <div>Invalid project ID</div>;
  }

  return <EstimatesView projectId={projectId} embedded={embedded} />;
}
