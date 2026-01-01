import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  Pin, 
  Plus, 
  X, 
  Folder, 
  Users, 
  FileText, 
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Search
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PinnedItem, Project, Contact } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ITEM_ICONS: Record<string, typeof Folder> = {
  project: Folder,
  contact: Users,
  document: FileText,
  page: ExternalLink,
};

function SortablePinnedItem({ 
  item, 
  onRemove,
  onClick,
}: { 
  item: PinnedItem;
  onRemove: (id: string) => void;
  onClick: (item: PinnedItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = ITEM_ICONS[item.itemType] || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover-elevate cursor-pointer"
      onClick={() => onClick(item)}
      data-testid={`pinned-item-${item.id}`}
    >
      <button 
        {...attributes} 
        {...listeners} 
        className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate flex-1">{item.itemName}</span>
      <Badge variant="secondary" className="text-[10px] px-1 py-0">
        {item.itemType}
      </Badge>
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        data-testid={`remove-pinned-${item.id}`}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function PinnedItemsWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: pinnedItems = [], isLoading } = useQuery<PinnedItem[]>({
    queryKey: ["/api/pinned-items"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isAddDialogOpen,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAddDialogOpen,
  });

  const addPinnedItem = useMutation({
    mutationFn: async (data: { itemType: string; itemId: string; itemName: string }) => {
      return apiRequest("/api/pinned-items", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pinned-items"] });
      toast({ title: "Item pinned" });
    },
    onError: () => {
      toast({ title: "Failed to pin item", variant: "destructive" });
    },
  });

  const removePinnedItem = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/pinned-items/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pinned-items"] });
      toast({ title: "Item unpinned" });
    },
  });

  const reorderPinnedItems = useMutation({
    mutationFn: async (items: { id: string; sortOrder: number }[]) => {
      return apiRequest("/api/pinned-items/reorder", "PUT", { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pinned-items"] });
    },
  });

  const sortedItems = useMemo(() => {
    return [...pinnedItems].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [pinnedItems]);

  const filteredProjects = useMemo(() => {
    const pinnedProjectIds = new Set(
      pinnedItems.filter(p => p.itemType === "project").map(p => p.itemId)
    );
    return projects
      .filter(p => !p.isArchived && !pinnedProjectIds.has(p.id))
      .filter(p => 
        !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 10);
  }, [projects, pinnedItems, searchQuery]);

  const filteredContacts = useMemo(() => {
    const pinnedContactIds = new Set(
      pinnedItems.filter(p => p.itemType === "contact").map(p => p.itemId)
    );
    return contacts
      .filter(c => !pinnedContactIds.has(c.id))
      .filter(c => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          c.name?.toLowerCase().includes(query) ||
          c.company?.toLowerCase().includes(query) ||
          c.firstName?.toLowerCase().includes(query) ||
          c.lastName?.toLowerCase().includes(query)
        );
      })
      .slice(0, 10);
  }, [contacts, pinnedItems, searchQuery]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedItems.findIndex(item => item.id === active.id);
    const newIndex = sortedItems.findIndex(item => item.id === over.id);
    const newItems = arrayMove(sortedItems, oldIndex, newIndex);
    
    reorderPinnedItems.mutate(
      newItems.map((item, index) => ({ id: item.id, sortOrder: index }))
    );
  };

  const handleItemClick = (item: PinnedItem) => {
    switch (item.itemType) {
      case "project":
        navigate(`/projects/${item.itemId}`);
        break;
      case "contact":
        navigate(`/business/contacts?id=${item.itemId}`);
        break;
      case "page":
        navigate(item.itemId);
        break;
    }
  };

  const handleAddItem = (type: string, id: string, name: string) => {
    addPinnedItem.mutate({ itemType: type, itemId: id, itemName: name });
    setIsAddDialogOpen(false);
    setSearchQuery("");
  };

  if (isConfiguring) {
    return (
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <Label>Widget Title</Label>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            placeholder="Pinned Items"
            data-testid="input-widget-title"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCloseConfig}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onUpdate?.({ ...widget, title: editingTitle });
              onCloseConfig?.();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="pinned-items-widget">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{widget.title || "Pinned Items"}</span>
          <Badge variant="secondary" className="text-[10px]">
            {pinnedItems.length}
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setIsAddDialogOpen(true)}
          data-testid="button-add-pinned"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2 text-center px-4">
            <Pin className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              No pinned items yet. Click + to add favorites.
            </span>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedItems.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="p-1">
                {sortedItems.map((item) => (
                  <SortablePinnedItem
                    key={item.id}
                    item={item}
                    onRemove={(id) => removePinnedItem.mutate(id)}
                    onClick={handleItemClick}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Pinned Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-pinned"
              />
            </div>
            <Tabs defaultValue="projects">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
              </TabsList>
              <TabsContent value="projects" className="mt-2">
                <ScrollArea className="h-[200px]">
                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No projects found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredProjects.map((project) => (
                        <button
                          key={project.id}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover-elevate text-left"
                          onClick={() => handleAddItem("project", project.id, project.name)}
                          data-testid={`add-project-${project.id}`}
                        >
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate">{project.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
              <TabsContent value="contacts" className="mt-2">
                <ScrollArea className="h-[200px]">
                  {filteredContacts.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No contacts found
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredContacts.map((contact) => (
                        <button
                          key={contact.id}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover-elevate text-left"
                          onClick={() => handleAddItem(
                            "contact", 
                            contact.id, 
                            contact.name || contact.company || `${contact.firstName} ${contact.lastName}`
                          )}
                          data-testid={`add-contact-${contact.id}`}
                        >
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate">
                            {contact.name || contact.company || `${contact.firstName} ${contact.lastName}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
