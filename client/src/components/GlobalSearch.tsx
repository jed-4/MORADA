import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { 
  Folder, 
  Users, 
  CheckSquare, 
  FileText,
  Building2,
  Palette,
  FileSearch,
  Receipt,
  ClipboardList,
  Calendar,
  Settings,
  User,
  Home
} from "lucide-react";
import type { Project, Contact, Task } from "@shared/schema";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  // Fetch data for search
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: open,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: open,
  });

  // Filter results based on search
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects.slice(0, 5);
    const query = search.toLowerCase();
    return projects
      .filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [projects, search]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts.slice(0, 5);
    const query = search.toLowerCase();
    return contacts
      .filter(c => 
        c.name?.toLowerCase().includes(query) ||
        c.company?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.firstName?.toLowerCase().includes(query) ||
        c.lastName?.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [contacts, search]);

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks.slice(0, 5);
    const query = search.toLowerCase();
    return tasks
      .filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [tasks, search]);

  // Quick navigation items
  const quickNavItems = [
    { name: "Dashboard", icon: Home, path: "/" },
    { name: "Projects", icon: Folder, path: "/business/projects" },
    { name: "Contacts", icon: Users, path: "/business/contacts" },
    { name: "Tasks", icon: CheckSquare, path: "/business/tasks" },
    { name: "Calendar", icon: Calendar, path: "/business/calendar" },
    { name: "Estimates", icon: FileText, path: "/business/estimates" },
    { name: "Bills", icon: Receipt, path: "/business/bills" },
    { name: "RFQs", icon: FileSearch, path: "/business/rfqs" },
    { name: "RFIs", icon: ClipboardList, path: "/business/rfis" },
    { name: "Selections", icon: Palette, path: "/business/selections" },
    { name: "Settings", icon: Settings, path: "/settings" },
    { name: "Profile", icon: User, path: "/profile" },
  ];

  const filteredNavItems = useMemo(() => {
    if (!search.trim()) return quickNavItems.slice(0, 6);
    const query = search.toLowerCase();
    return quickNavItems.filter(item => 
      item.name.toLowerCase().includes(query)
    );
  }, [search]);

  const handleSelect = (path: string) => {
    navigate(path);
    onOpenChange(false);
    setSearch("");
  };

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Search projects, contacts, tasks..." 
        value={search}
        onValueChange={setSearch}
        data-testid="input-global-search"
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        {/* Quick Navigation */}
        {filteredNavItems.length > 0 && (
          <CommandGroup heading="Quick Navigation">
            {filteredNavItems.map((item) => (
              <CommandItem
                key={item.path}
                onSelect={() => handleSelect(item.path)}
                data-testid={`search-nav-${item.name.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                <span>{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Projects */}
        {filteredProjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {filteredProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => handleSelect(`/projects/${project.id}`)}
                  data-testid={`search-project-${project.id}`}
                >
                  <Folder className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{project.name}</span>
                  {project.isArchived && (
                    <span className="ml-2 text-xs text-muted-foreground">(Archived)</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Contacts */}
        {filteredContacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contacts">
              {filteredContacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  onSelect={() => handleSelect(`/business/contacts?id=${contact.id}`)}
                  data-testid={`search-contact-${contact.id}`}
                >
                  <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{contact.name || contact.company || `${contact.firstName} ${contact.lastName}`}</span>
                  {contact.contactType && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">({contact.contactType})</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Tasks */}
        {filteredTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {filteredTasks.map((task) => (
                <CommandItem
                  key={task.id}
                  onSelect={() => handleSelect(`/projects/${task.projectId}/tasks?taskId=${task.id}`)}
                  data-testid={`search-task-${task.id}`}
                >
                  <CheckSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="truncate">{task.title}</span>
                  {task.status && (
                    <span className="ml-2 text-xs text-muted-foreground capitalize">({task.status})</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
