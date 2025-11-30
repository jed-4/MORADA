import { useState, useRef } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoteTemplatesLibrary, type NoteTemplatesLibraryHandle } from "@/components/systems/NoteTemplatesLibrary";

export default function NoteTemplates() {
  const [searchQuery, setSearchQuery] = useState("");
  const noteTemplatesRef = useRef<NoteTemplatesLibraryHandle>(null);

  return (
    <div className="flex flex-col h-full" data-testid="note-templates-page">
      {/* Header */}
      <div className="h-14 bg-background flex items-center justify-between px-6 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Note Templates</h1>
          <p className="text-xs text-muted-foreground">Create reusable note templates with custom fields</p>
        </div>
        <Button
          size="sm"
          className="bg-[#bba7db] text-white hover:bg-[#bba7db]/90"
          onClick={() => noteTemplatesRef.current?.openNewTemplateDialog()}
          data-testid="button-create-template"
        >
          <Plus className="w-4 h-4 mr-1" />
          Create Template
        </Button>
      </div>

      {/* Search Bar */}
      <div className="h-12 bg-background flex items-center px-6 border-b border-border flex-shrink-0">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8"
            data-testid="input-search-templates"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <NoteTemplatesLibrary ref={noteTemplatesRef} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
