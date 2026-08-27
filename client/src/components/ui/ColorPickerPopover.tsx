import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { moradaColorName } from '@/lib/colors';
import { ChevronDown } from 'lucide-react';

interface ColorPickerPopoverProps {
  value: string | null | undefined;
  onChange: (hex: string) => void;
  /** Shown in the trigger when no colour is set. */
  placeholder?: string;
  align?: 'start' | 'center' | 'end';
  disabled?: boolean;
  'data-testid'?: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Swatch trigger + the shared palette picker in a popover. Use this anywhere a
 * colour is chosen so every surface offers the same Morada palette instead of
 * dropping the user straight into a native colour wheel.
 */
export function ColorPickerPopover({
  value,
  onChange,
  placeholder = 'Pick a colour',
  align = 'start',
  disabled,
  'data-testid': testId = 'button-color-picker',
}: ColorPickerPopoverProps) {
  const hex = HEX.test(value ?? '') ? (value as string) : undefined;
  const name = moradaColorName(hex);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="h-9 w-full px-2 flex items-center gap-2 rounded-md border border-input bg-background text-sm hover-elevate active-elevate-2 focus-visible:ring-2 focus-visible:ring-primary/35 focus:outline-none disabled:opacity-50"
          data-testid={testId}
        >
          <span
            className="w-5 h-5 rounded-full border border-black/10 flex-shrink-0"
            style={{ backgroundColor: hex ?? 'transparent' }}
          />
          <span className={`flex-1 text-left truncate ${hex ? '' : 'text-muted-foreground'}`}>
            {hex ? (name ?? hex.toUpperCase()) : placeholder}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="p-0 w-auto">
        <ColorPicker value={hex ?? ''} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}
