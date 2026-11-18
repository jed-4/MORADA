import { useState } from "react";
import { SmilePlus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A small curated set of emojis for Messages channels — building, site and
 * office work. Deliberately not a full emoji library: a channel icon is picked
 * once, and ~70 relevant choices beat a 3,000-item search for that.
 */
export const CHANNEL_EMOJIS: string[] = [
  // Building & site
  "🏗️", "🏠", "🏡", "🏢", "🧱", "🪵", "🔨", "🪚", "🔧", "🪛", "🔩", "⚙️",
  "🧰", "🪜", "📐", "📏", "🦺", "⛑️", "🚧", "🚚", "🚜", "🏭",
  // Trades
  "⚡", "🔌", "💡", "🚿", "🛁", "🚽", "🚰", "🔥", "❄️", "🎨", "🖌️", "🪟",
  "🚪", "🛋️", "🍳", "🌳", "🌱", "🌊", "☀️", "🌧️",
  // Office & admin
  "📋", "📝", "📁", "📄", "🗂️", "📊", "📈", "💰", "💵", "🧾", "🗓️", "⏰",
  "📸", "📞", "📧", "💬", "📣", "🔔", "🤝", "👷", "👥", "⭐",
  // Status
  "✅", "⚠️", "❗", "🚨", "🎯", "🚀", "🎉", "❤️",
];

interface ChannelEmojiPickerProps {
  value: string | null | undefined;
  onChange: (emoji: string | null) => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Square trigger showing the current emoji (or a muted smiley-plus when none)
 * that opens a grid of {@link CHANNEL_EMOJIS} in a Popover.
 */
export function ChannelEmojiPicker({
  value,
  onChange,
  disabled,
  className,
  "data-testid": testId = "button-channel-emoji",
}: ChannelEmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const pick = (emoji: string | null) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          className={cn("h-9 w-9 shrink-0 text-lg leading-none", className)}
          title={value ? "Change channel emoji" : "Add channel emoji"}
          aria-label={value ? "Change channel emoji" : "Add channel emoji"}
          data-testid={testId}
        >
          {value ? (
            <span aria-hidden>{value}</span>
          ) : (
            <SmilePlus className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17.5rem] p-2">
        <div className="grid grid-cols-8 gap-0.5" role="listbox" aria-label="Channel emoji">
          {CHANNEL_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="option"
              aria-selected={value === emoji}
              onClick={() => pick(emoji)}
              className={cn(
                "h-8 w-8 rounded-md text-lg leading-none flex items-center justify-center hover:bg-muted transition-colors",
                value === emoji && "bg-primary/15 ring-1 ring-primary/50",
              )}
              data-testid={`emoji-option-${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            data-testid="button-remove-channel-emoji"
          >
            <X className="h-3 w-3" />
            Remove emoji
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Inline emoji glyph sized to sit where a 14–16px lucide icon would. */
export function ChannelEmoji({ emoji, className }: { emoji: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 inline-flex w-4 justify-center text-sm leading-none", className)}
    >
      {emoji}
    </span>
  );
}
