import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@shared/schema";

interface UserSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  showAvatar?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function UserSelect({
  value,
  onValueChange,
  placeholder = "Select user...",
  disabled = false,
  allowClear = false,
  allowNone = true,
  noneLabel = "Unassigned",
  showAvatar = true,
  className,
  "data-testid": testId,
}: UserSelectProps) {
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: noneLabel,
      });
    }
    
    users.forEach((user) => {
      const displayName = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.email || 'Unknown User';
      
      const initials = user.firstName && user.lastName
        ? `${user.firstName[0]}${user.lastName[0]}`
        : user.email?.[0]?.toUpperCase() || '?';
        
      opts.push({
        value: user.id,
        label: displayName,
        description: user.email || undefined,
        icon: showAvatar ? (
          <Avatar className="h-5 w-5">
            <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        ) : undefined,
      });
    });
    
    return opts;
  }, [users, allowNone, noneLabel, showAvatar]);

  const handleValueChange = (newValue: string) => {
    if (newValue === "none") {
      onValueChange("");
    } else {
      onValueChange(newValue);
    }
  };

  return (
    <SearchableSelect
      options={options}
      value={value || (allowNone ? "none" : undefined)}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "Loading..." : placeholder}
      searchPlaceholder="Search users..."
      emptyMessage="No users found."
      disabled={disabled || isLoading}
      allowClear={allowClear}
      className={className}
      data-testid={testId}
    />
  );
}
