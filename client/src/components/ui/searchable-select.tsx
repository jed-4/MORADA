"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface SearchableSelectOption {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
  group?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  allowClear?: boolean
  "data-testid"?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  triggerClassName,
  allowClear = false,
  "data-testid": testId,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, SearchableSelectOption[]> = {}
    const ungrouped: SearchableSelectOption[] = []

    options.forEach((option) => {
      if (option.group) {
        if (!groups[option.group]) {
          groups[option.group] = []
        }
        groups[option.group].push(option)
      } else {
        ungrouped.push(option)
      }
    })

    return { groups, ungrouped }
  }, [options])

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue === value ? "" : selectedValue)
    setOpen(false)
    setSearchValue("")
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selectedOption && "text-muted-foreground",
            triggerClassName
          )}
          data-testid={testId}
        >
          <span className="truncate flex items-center gap-2">
            {selectedOption?.icon}
            {selectedOption?.label || placeholder}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {allowClear && value && (
              <X
                className="h-3 w-3 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", className)} align="start">
        {/* cmdk's default filter is a FUZZY subsequence match, which makes a
            numeric search wildly unintuitive: typing a cost code like "219"
            also returned "192", because those digits appear in it in order.
            Match directly instead — prefix first, then substring, nothing
            else — so a typed code finds that code and nothing near it. */}
        <Command
          shouldFilter={true}
          filter={(value, search) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            const v = value.toLowerCase();
            if (v.startsWith(q)) return 1;
            // Prefix of any word ("con" → "192 - Concrete"), ranked above a
            // bare mid-word substring so the obvious match sorts first.
            if (v.split(/[\s\-–—/,()]+/).some((w) => w.startsWith(q))) return 0.7;
            if (v.includes(q)) return 0.4;
            return 0;
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groupedOptions.ungrouped.length > 0 && (
              <CommandGroup>
                {groupedOptions.ungrouped.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className="cursor-pointer"
                    data-testid={`option-${option.value}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        {option.icon}
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {Object.entries(groupedOptions.groups).map(([groupName, groupOptions]) => (
              <CommandGroup key={groupName} heading={groupName}>
                {groupOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className="cursor-pointer"
                    data-testid={`option-${option.value}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        {option.icon}
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
