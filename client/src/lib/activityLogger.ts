import { apiRequest } from "@/lib/queryClient";

export interface ActivityLogData {
  projectId: string;
  userId?: string;
  userName?: string;
  activityType: "task" | "estimate" | "bill" | "variation" | "invoice" | "project" | "other";
  action: "created" | "updated" | "completed" | "deleted" | "status_changed" | "approved" | "rejected" | "submitted" | "paid";
  description: string;
  entityId?: string;
  entityName?: string;
  metadata?: Record<string, any>;
}

export async function logActivity(data: ActivityLogData): Promise<void> {
  try {
    await apiRequest("/api/activities", "POST", {
      ...data,
      metadata: data.metadata || {},
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}
