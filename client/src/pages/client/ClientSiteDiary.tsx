import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format } from "date-fns";
import { NotebookPen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientEmpty, ClientLoading, ClientPage } from "@/components/client/ClientPage";

/**
 * Site diary entries the builder chose to share.
 *
 * Read-only, and only entries ticked "share with client" — enforced on the
 * server (see server/clientProjections.ts), not by hiding cards here.
 */

interface DiaryEntry {
  id: string;
  title: string;
  templateName?: string | null;
  entryDateTime: string;
  fieldValues?: Record<string, unknown> | null;
  overallPhotos?: Array<string | { url?: string; name?: string }> | null;
  weather?: { temp?: number | string; condition?: string } | null;
  createdByName?: string | null;
}

const photoUrl = (photo: string | { url?: string; name?: string }) =>
  typeof photo === "string" ? photo : photo?.url ?? "";

/** Field values are a template-shaped bag; show the plain text ones. */
const textFields = (values: DiaryEntry["fieldValues"]): Array<[string, string]> =>
  Object.entries(values ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .slice(0, 6) as Array<[string, string]>;

export default function ClientSiteDiary() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: entries = [], isLoading } = useQuery<DiaryEntry[]>({
    queryKey: [`/api/projects/${projectId}/site-diary-entries`],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Site diary">
        <ClientLoading label="Loading site diary…" />
      </ClientPage>
    );
  }

  if (entries.length === 0) {
    return (
      <ClientPage title="Site diary" description="Updates from site, shared by your builder.">
        <ClientEmpty
          icon={NotebookPen}
          title="No site updates yet"
          description="When your builder shares a diary entry from site, it'll show up here."
        />
      </ClientPage>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime(),
  );

  return (
    <ClientPage title="Site diary" description="Updates from site, shared by your builder.">
      <div className="space-y-4">
        {sorted.map((entry) => {
          const photos = (entry.overallPhotos ?? []).map(photoUrl).filter(Boolean);
          return (
            <Card key={entry.id} data-testid={`client-diary-${entry.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-medium">{entry.title}</h2>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(entry.entryDateTime), "EEE d MMM yyyy")}
                  </span>
                </div>

                {textFields(entry.fieldValues).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                    <p className="text-sm whitespace-pre-wrap">{value}</p>
                  </div>
                ))}

                {photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {photos.map((url, i) => (
                      <img
                        key={`${entry.id}-${i}`}
                        src={url}
                        alt=""
                        loading="lazy"
                        className="rounded-md border object-cover w-full aspect-[4/3]"
                      />
                    ))}
                  </div>
                )}

                {entry.createdByName && (
                  <p className="text-xs text-muted-foreground">Posted by {entry.createdByName}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClientPage>
  );
}
