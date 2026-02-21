import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";
import { Building2 } from "lucide-react";
import type { Contact, User } from "@shared/schema";

interface ContactSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowNone?: boolean;
  allowBusiness?: boolean;
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
  allowBusiness = false,
  contactType,
  className,
  "data-testid": testId,
}: ContactSelectProps) {
  const { data: allContacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: user } = useQuery<User & { companyNickname?: string }>({
    queryKey: ["/api/auth/user"],
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
    
    if (allowBusiness && user?.companyId) {
      const businessName = (user as any)?.companyNickname || "The Business";
      opts.push({
        value: `company:${user.companyId}`,
        label: businessName,
        description: "Assign to your business",
        group: "Business",
      });
    }
    
    contacts.forEach((contact) => {
      const companyName = (contact.company || '').trim();
      const contactName = (contact.name || '').trim();
      let displayName: string;
      if (companyName && contactName && companyName.toLowerCase() !== contactName.toLowerCase()) {
        displayName = `${companyName} - ${contactName}`;
      } else {
        displayName = companyName || contactName || 'Unnamed Contact';
      }
        
      opts.push({
        value: contact.id,
        label: displayName,
        description: contact.email || undefined,
        group: contact.contactType || undefined,
      });
    });
    
    return opts;
  }, [contacts, allowNone, allowBusiness, user]);

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
