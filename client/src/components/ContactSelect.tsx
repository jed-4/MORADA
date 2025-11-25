import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import type { Contact } from "@shared/schema";

interface ContactSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  contactType?: "client" | "subcontractor" | "supplier" | "consultant" | "other";
  className?: string;
  "data-testid"?: string;
}

export function ContactSelect({
  value,
  onValueChange,
  placeholder = "Select contact...",
  disabled = false,
  allowClear = false,
  allowNone = true,
  contactType,
  className,
  "data-testid": testId,
}: ContactSelectProps) {
  const { data: allContacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const contacts = useMemo(() => {
    if (!contactType) return allContacts;
    return allContacts.filter((c) => c.contactType === contactType);
  }, [allContacts, contactType]);

  const options: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [];
    
    if (allowNone) {
      opts.push({
        value: "none",
        label: "None",
      });
    }
    
    contacts.forEach((contact) => {
      const displayName = contact.company 
        ? `${contact.company}${contact.name ? ` - ${contact.name}` : ''}`
        : contact.name || 'Unnamed Contact';
        
      opts.push({
        value: contact.id,
        label: displayName,
        description: contact.email || undefined,
        group: contact.contactType || undefined,
      });
    });
    
    return opts;
  }, [contacts, allowNone]);

  const handleValueChange = (newValue: string) => {
    if (newValue === "none") {
      onValueChange("");
    } else {
      onValueChange(newValue);
    }
  };

  const placeholderText = contactType 
    ? `Select ${contactType}...` 
    : placeholder;

  return (
    <SearchableSelect
      options={options}
      value={value || (allowNone ? "none" : undefined)}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "Loading..." : placeholderText}
      searchPlaceholder={`Search ${contactType || 'contacts'}...`}
      emptyMessage={`No ${contactType || 'contacts'} found.`}
      disabled={disabled || isLoading}
      allowClear={allowClear}
      className={className}
      data-testid={testId}
    />
  );
}
