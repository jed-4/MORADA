import { MORADA_PALETTE_GROUPS, moradaColorName, type MoradaSwatchGroup } from '@/lib/colors';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Show the native colour input + hex field under the presets. */
  showCustom?: boolean;
  /**
   * Override the preset groups. Defaults to the canonical Morada palette; pass
   * your own only if a surface genuinely needs a different set, the way takeoff
   * needs drawing-weight colours (see MORADA_MARKUP_PALETTE in lib/colors.ts).
   */
  groups?: MoradaSwatchGroup[];
  'data-testid'?: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function ColorPicker({
  value,
  onChange,
  showCustom = true,
  groups = MORADA_PALETTE_GROUPS,
  'data-testid': testId = 'color-picker',
}: ColorPickerProps) {
  const [customHex, setCustomHex] = useState(value ?? '');

  // Keep the hex field in step when the colour is changed by clicking a
  // preset, otherwise it keeps showing whatever was typed last.
  useEffect(() => { setCustomHex(value ?? ''); }, [value]);

  const selected = value?.toLowerCase();
  const isPreset = groups.some(g => g.colors.some(c => c.hex.toLowerCase() === selected));

  const commitCustom = (raw: string) => {
    const next = raw.trim();
    if (HEX.test(next)) onChange(next.toUpperCase());
    else setCustomHex(value ?? '');
  };

  return (
    <div className="p-3 w-64" data-testid={testId}>
      <div className="space-y-2.5">
        {groups.map(({ group, colors }) => (
          <div key={group}>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {group}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {colors.map(({ name, hex }) => (
                <button
                  key={hex}
                  type="button"
                  title={`${name} ${hex}`}
                  aria-label={name}
                  aria-pressed={selected === hex.toLowerCase()}
                  onClick={() => onChange(hex)}
                  className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary/35 focus:outline-none"
                  style={{ backgroundColor: hex }}
                  data-testid={`swatch-${name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {selected === hex.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 pt-2.5 mt-2.5 border-t border-border">
          <input
            type="color"
            aria-label="Custom colour"
            value={HEX.test(value ?? '') ? value : '#A890D4'}
            onChange={e => onChange(e.target.value.toUpperCase())}
            className="w-7 h-7 rounded-full border border-black/10 cursor-pointer p-0.5 bg-transparent flex-shrink-0"
            data-testid="input-custom-color"
          />
          <input
            type="text"
            placeholder="#RRGGBB"
            value={customHex}
            onChange={e => setCustomHex(e.target.value)}
            onBlur={e => commitCustom(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitCustom(customHex); }
            }}
            className="flex-1 min-w-0 text-xs border border-border rounded px-2 py-1 font-mono bg-background text-foreground focus-visible:ring-2 focus-visible:ring-primary/35 focus:outline-none"
            data-testid="input-custom-hex"
          />
        </div>
      )}

      {/* Name the current colour so a preset is identifiable without hovering,
          and a custom one is obviously off-palette. */}
      <div className="text-[10px] text-muted-foreground mt-2 truncate" data-testid="text-color-label">
        {HEX.test(value ?? '')
          ? (isPreset ? moradaColorName(value) : `Custom ${value.toUpperCase()}`)
          : 'No colour set'}
      </div>
    </div>
  );
}
