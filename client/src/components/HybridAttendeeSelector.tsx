import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type Attendee = string | { name: string; contactId: string };

interface HybridAttendeeSelectorProps {
  value: Attendee[];
  onChange: (attendees: Attendee[]) => void;
  projectId?: string;
}

export function HybridAttendeeSelector({ value, onChange, projectId }: HybridAttendeeSelectorProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: contacts = [] } = useQuery<Array<{ id: string; name: string; company?: string }>>({
    queryKey: ["/api/contacts", { projectId }],
    enabled: showSuggestions && inputValue.length > 0,
  });

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const addAttendee = (attendee: Attendee) => {
    const isDuplicate = value.some((existing) => {
      if (typeof existing === "string" && typeof attendee === "string") {
        return existing.toLowerCase() === attendee.toLowerCase();
      }
      if (typeof existing === "object" && typeof attendee === "object") {
        return existing.contactId === attendee.contactId;
      }
      if (typeof existing === "string" && typeof attendee === "object") {
        return existing.toLowerCase() === attendee.name.toLowerCase();
      }
      if (typeof existing === "object" && typeof attendee === "string") {
        return existing.name.toLowerCase() === attendee.toLowerCase();
      }
      return false;
    });

    if (!isDuplicate) {
      onChange([...value, attendee]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeAttendee = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addAttendee(inputValue.trim());
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const getAttendeeName = (attendee: Attendee): string => {
    return typeof attendee === "string" ? attendee : attendee.name;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative" ref={inputRef}>
        <div className="flex gap-2">
          <Input
            data-testid="input-attendees"
            placeholder="Type name or select from contacts..."
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => setShowSuggestions(inputValue.length > 0)}
            onKeyDown={handleKeyDown}
          />
          {inputValue.trim() && (
            <Button
              data-testid="button-add-custom-attendee"
              type="button"
              size="icon"
              variant="outline"
              onClick={() => addAttendee(inputValue.trim())}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {showSuggestions && filteredContacts.length > 0 && (
          <Card className="absolute z-10 w-full mt-1 max-h-60 overflow-auto">
            <div className="p-1">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  data-testid={`button-select-contact-${contact.id}`}
                  type="button"
                  className="w-full text-left px-3 py-2 hover-elevate active-elevate-2 rounded-md"
                  onClick={() => addAttendee({ name: contact.name, contactId: contact.id })}
                >
                  <div className="font-medium">{contact.name}</div>
                  {contact.company && (
                    <div className="text-sm text-muted-foreground">{contact.company}</div>
                  )}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((attendee, index) => (
            <Badge
              key={index}
              data-testid={`badge-attendee-${index}`}
              variant="secondary"
              className="gap-1"
            >
              {getAttendeeName(attendee)}
              <button
                data-testid={`button-remove-attendee-${index}`}
                type="button"
                onClick={() => removeAttendee(index)}
                className="hover-elevate active-elevate-2 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
