import { pickerLabel, type PersonLike } from "@/lib/people";
import { usePeople } from "@/hooks/use-people";
import { useMemo } from "react";
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
  triggerClassName?: string;
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
  triggerClassName,
  "data-testid": testId,
}: UserSelectProps) {
  // You first, then A–Z; no client logins; archived people collapsed at the bottom.
  const { active: users, archived, meId, isLoading } = usePeople<User & PersonLike>();

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: noneLabel,
      });
    }
    
    const add = (user: any, group?: string) => {
      const displayName = pickerLabel(user, meId);
      
      const initials = user.firstName && user.lastName
        ? `${user.firstName[0]}${user.lastName[0]}`
        : user.email?.[0]?.toUpperCase() || '?';
        
      opts.push({
        value: user.id,
        label: displayName,
        group,
        icon: showAvatar ? (
          <Avatar className="h-5 w-5">
            <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-data">{initials}</AvatarFallback>
          </Avatar>
        ) : undefined,
      });
    };
    users.forEach((u) => add(u));
    archived.forEach((u) => add(u, "Archived"));
    
    return opts;
  }, [users, archived, meId, allowNone, noneLabel, showAvatar]);

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
      collapsedGroups={["Archived"]}
      className={className}
      triggerClassName={triggerClassName}
      data-testid={testId}
    />
  );
}
