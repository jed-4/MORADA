import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Loader2, NotebookPen } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ClientListPage } from "@/components/client/ClientListPage";

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
  const [search, setSearch] = useState("");

  const { data: entries = [], isLoading } = useQuery<DiaryEntry[]>({
    queryKey: [`/api/projects/${projectId}/site-diary-entries`],
    enabled: !!projectId,
  });

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...entries]
      .filter((entry) =>
        !term ||
        [entry.title, entry.templateName, ...Object.values(entry.fieldValues ?? {}).map(String)]
          .some((field) => (field ?? "").toLowerCase().includes(term)),
      )
      .sort((a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime());
  }, [entries, search]);

  return (
    <ClientListPage
      title="Site diary"
      chips={entries.length ? [{ label: `${entries.length} update${entries.length === 1 ? "" : "s"}` }] : []}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search updates..."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No site updates yet"
          description="When your builder shares a diary entry from site, it'll show up here."
          variant="inline"
          className="py-16"
        />
      ) : sorted.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Nothing matches that" description="Try a different search." variant="inline" className="py-16" />
      ) : (
        sorted.map((entry) => {
          const photos = (entry.overallPhotos ?? []).map(photoUrl).filter(Boolean);
          return (
            <div key={entry.id} className="px-4 py-4 border-b last:border-b-0 space-y-3" data-testid={`client-diary-${entry.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{entry.title}</h2>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(entry.entryDateTime), "EEE d MMM yyyy")}
                </span>
              </div>

              {textFields(entry.fieldValues).map(([label, value]) => (
                <div key={label}>
                  <div className="text-data uppercase tracking-wide text-muted-foreground">{label}</div>
                  <p className="text-sm whitespace-pre-wrap">{value}</p>
                </div>
              ))}

              {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {photos.map((url, i) => (
                    <img
                      key={`${entry.id}-${i}`}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="rounded-md border object-cover w-full aspect-square"
                    />
                  ))}
                </div>
              )}

              {entry.createdByName && (
                <p className="text-xs text-muted-foreground">Posted by {entry.createdByName}</p>
              )}
            </div>
          );
        })
      )}
    </ClientListPage>
  );
}
