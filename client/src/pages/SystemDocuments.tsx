export default function SystemDocuments() {
  return (
    <div className="flex flex-col h-full" data-testid="system-documents">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">System Documents</h1>
          </div>
          <p className="text-muted-foreground">
            Store and manage business-wide documents, policies, and reference materials.
          </p>
          <div className="flex items-center justify-center h-64 border rounded-lg bg-muted/20">
            <p className="text-muted-foreground">System documents feature coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
