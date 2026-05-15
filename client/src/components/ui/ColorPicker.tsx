import { BUILDPRO_PALETTE } from '@/lib/colors';
import { Check } from 'lucide-react';
import { useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  showCustom?: boolean;
}

export function ColorPicker({ value, onChange, showCustom = true }: ColorPickerProps) {
  const [customHex, setCustomHex] = useState('');

  return (
    <div className="p-3 w-72">
      <div className="grid grid-cols-8 gap-1.5 mb-3">
        {BUILDPRO_PALETTE.map(({ name, hex }) => (
          <button
            key={hex}
            title={name}
            onClick={() => onChange(hex)}
            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
            style={{ backgroundColor: hex }}
          >
            {value?.toLowerCase() === hex.toLowerCase() && (
              <Check className="w-3 h-3 text-white drop-shadow-sm" />
            )}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <input
            type="color"
            value={value?.match(/^#[0-9A-Fa-f]{6}$/) ? value : '#a890d4'}
            onChange={e => onChange(e.target.value)}
            className="w-7 h-7 rounded-full border border-black/10 cursor-pointer p-0.5 bg-transparent"
          />
          <input
            type="text"
            placeholder="#RRGGBB"
            value={customHex}
            onChange={e => setCustomHex(e.target.value)}
            onBlur={() => {
              if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
                onChange(customHex);
                setCustomHex('');
              }
            }}
            className="flex-1 text-xs border border-border rounded px-2 py-1 font-mono bg-background text-foreground"
          />
        </div>
      )}
    </div>
  );
}
