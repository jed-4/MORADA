import { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eraser, Pen, Type } from 'lucide-react';

export type SignatureResult = {
  data: string;
  method: 'drawn' | 'typed';
};

interface SignaturePadProps {
  onChange: (result: SignatureResult | null) => void;
  defaultName?: string;
}

export function SignaturePad({ onChange, defaultName = '' }: SignaturePadProps) {
  const canvasRef = useRef<SignatureCanvas>(null);
  const [mode, setMode] = useState<'drawn' | 'typed'>('drawn');
  const [typedName, setTypedName] = useState(defaultName);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    if (mode === 'typed') {
      const name = typedName.trim();
      if (name) {
        onChange({ data: name, method: 'typed' });
      } else {
        onChange(null);
      }
    } else {
      if (hasDrawing && canvasRef.current && !canvasRef.current.isEmpty()) {
        const data = canvasRef.current.toDataURL('image/png');
        onChange({ data, method: 'drawn' });
      } else {
        onChange(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedName, mode, hasDrawing]);

  const handleClear = () => {
    canvasRef.current?.clear();
    setHasDrawing(false);
    onChange(null);
  };

  const handleEnd = () => {
    if (canvasRef.current && !canvasRef.current.isEmpty()) {
      setHasDrawing(true);
      const data = canvasRef.current.toDataURL('image/png');
      onChange({ data, method: 'drawn' });
    }
  };

  return (
    <div className="space-y-3" data-testid="signature-pad">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'drawn' | 'typed')}>
        <TabsList className="w-full">
          <TabsTrigger value="drawn" className="flex-1 gap-2" data-testid="tab-signature-drawn">
            <Pen className="w-4 h-4" /> Draw
          </TabsTrigger>
          <TabsTrigger value="typed" className="flex-1 gap-2" data-testid="tab-signature-typed">
            <Type className="w-4 h-4" /> Type
          </TabsTrigger>
        </TabsList>
        <TabsContent value="drawn" className="mt-3 space-y-2">
          <div className="border rounded-md bg-background overflow-hidden" data-testid="canvas-signature">
            <SignatureCanvas
              ref={canvasRef}
              penColor="#1F2937"
              canvasProps={{
                className: 'w-full h-40 bg-white',
              }}
              onEnd={handleEnd}
            />
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Sign with your mouse, finger, or stylus</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              data-testid="button-clear-signature"
            >
              <Eraser className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="typed" className="mt-3 space-y-2">
          <Label htmlFor="typed-signature">Type your full name</Label>
          <Input
            id="typed-signature"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Your full name"
            className="font-serif italic text-lg"
            data-testid="input-typed-signature"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
