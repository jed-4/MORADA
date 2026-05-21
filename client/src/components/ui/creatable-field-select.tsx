import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
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
import { useQuery, useMutation } from "@tanstack/react-query"
import { queryClient, apiRequest } from "@/lib/queryClient"
import type { FieldCategoryWithOptions } from "@shared/schema"

interface CreatableFieldSelectProps {
  categoryKey: string
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  triggerClassName?: string
  disabled?: boolean
  "data-testid"?: string
}

export function CreatableFieldSelect({
  categoryKey,
  value,
  onValueChange,
  placeholder = "Select or add…",
  triggerClassName,
  disabled = false,
  "data-testid": testId,
}: CreatableFieldSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const { data: category } = useQuery<FieldCategoryWithOptions>({
    queryKey: [`/api/field-categories/by-key/${categoryKey}`],
  })

  const options = category?.options ?? []

  const filtered = React.useMemo(() => {
    if (!search) return options
    return options.filter((o) =>
      o.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [options, search])

  const exactMatch = options.some(
    (o) => o.name.toLowerCase() === search.trim().toLowerCase()
  )
  const showCreate = search.trim().length > 0 && !exactMatch

  const quickAddMutation = useMutation({
    mutationFn: async (name: string) =>
      apiRequest(
        `/api/field-categories/by-key/${categoryKey}/options/quick-add`,
        "POST",
        { name }
      ),
    onSuccess: (newOption: any) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/field-categories/by-key/${categoryKey}`],
      })
      onValueChange(newOption.name)
      setOpen(false)
      setSearch("")
    },
  })

  const handleSelect = (name: string) => {
    onValueChange(name === value ? "" : name)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "w-full h-9 justify-between font-normal text-sm shadow-none border-border",
            !value && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type to add…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <CommandEmpty>No options found.</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => handleSelect(opt.name)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={() => quickAddMutation.mutate(search.trim())}
                  className="cursor-pointer text-primary"
                  disabled={quickAddMutation.isPending}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {quickAddMutation.isPending
                    ? "Adding…"
                    : `Add "${search.trim()}"`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
