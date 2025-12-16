import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Users, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { User } from "@shared/schema";

interface MultiUserSelectProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxDisplayed?: number;
  "data-testid"?: string;
}

export function MultiUserSelect({
  value = [],
  onValueChange,
  placeholder = "Add assignees...",
  disabled = false,
  className,
  maxDisplayed = 3,
  "data-testid": testId,
}: MultiUserSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const lowerSearch = search.toLowerCase();
    return users.filter(user => {
      const name = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email || '';
      return name.toLowerCase().includes(lowerSearch) || 
             (user.email?.toLowerCase().includes(lowerSearch));
    });
  }, [users, search]);

  const selectedUsers = useMemo(() => {
    return users.filter(user => value.includes(user.id));
  }, [users, value]);

  const toggleUser = (userId: string) => {
    if (value.includes(userId)) {
      onValueChange(value.filter(id => id !== userId));
    } else {
      onValueChange([...value, userId]);
    }
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange(value.filter(id => id !== userId));
  };

  const getUserDisplay = (user: User) => {
    const displayName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email || 'Unknown';
    const initials = user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`
      : user.email?.[0]?.toUpperCase() || '?';
    return { displayName, initials };
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-7 justify-between font-normal text-xs px-2",
            !value.length && "text-muted-foreground",
            className
          )}
          data-testid={testId}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <Users className="h-3 w-3 shrink-0 opacity-50" />
            {selectedUsers.length === 0 ? (
              <span className="truncate">{isLoading ? "Loading..." : placeholder}</span>
            ) : (
              <div className="flex items-center gap-1 overflow-hidden">
                {selectedUsers.slice(0, maxDisplayed).map(user => {
                  const { displayName, initials } = getUserDisplay(user);
                  return (
                    <Badge 
                      key={user.id} 
                      variant="secondary" 
                      className="h-5 px-1.5 gap-1 text-[10px] shrink-0"
                    >
                      <Avatar className="h-3.5 w-3.5">
                        <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
                        <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[60px]">{displayName.split(' ')[0]}</span>
                      <X 
                        className="h-2.5 w-2.5 cursor-pointer opacity-70 hover:opacity-100" 
                        onClick={(e) => removeUser(user.id, e)}
                      />
                    </Badge>
                  );
                })}
                {selectedUsers.length > maxDisplayed && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    +{selectedUsers.length - maxDisplayed}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="start">
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
          data-testid="input-search-assignees"
        />
        <div className="max-h-[200px] overflow-y-auto space-y-0.5">
          {filteredUsers.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">
              No users found
            </div>
          ) : (
            filteredUsers.map(user => {
              const { displayName, initials } = getUserDisplay(user);
              const isSelected = value.includes(user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs",
                    "hover-elevate active-elevate-2",
                    isSelected && "bg-accent"
                  )}
                  data-testid={`button-toggle-user-${user.id}`}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
                    <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{displayName}</div>
                    {user.email && (
                      <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
