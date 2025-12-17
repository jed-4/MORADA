import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Palette, Image, Sparkles, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardTheme } from "@shared/schema";

interface DashboardThemeSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardType: "business" | "user" | "project";
  projectId?: string;
}

const COLOR_PRESETS = [
  { name: "Slate", color: "#f8fafc" },
  { name: "Stone", color: "#fafaf9" },
  { name: "Zinc", color: "#fafafa" },
  { name: "Sky", color: "#f0f9ff" },
  { name: "Blue", color: "#eff6ff" },
  { name: "Indigo", color: "#eef2ff" },
  { name: "Purple", color: "#faf5ff" },
  { name: "Rose", color: "#fff1f2" },
  { name: "Amber", color: "#fffbeb" },
  { name: "Emerald", color: "#ecfdf5" },
  { name: "Teal", color: "#f0fdfa" },
  { name: "Cyan", color: "#ecfeff" },
];

const GRADIENT_PRESETS = [
  { name: "Ocean", gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { name: "Sunset", gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  { name: "Forest", gradient: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" },
  { name: "Midnight", gradient: "linear-gradient(135deg, #232526 0%, #414345 100%)" },
  { name: "Sky Blue", gradient: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)" },
  { name: "Peach", gradient: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
];

export default function DashboardThemeSettings({
  open,
  onOpenChange,
  dashboardType,
  projectId,
}: DashboardThemeSettingsProps) {
  const queryClient = useQueryClient();
  
  const queryKey = projectId 
    ? [`/api/dashboard-themes/${dashboardType}`, { projectId }]
    : [`/api/dashboard-themes/${dashboardType}`];
  
  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey,
    enabled: open,
  });

  const [backgroundType, setBackgroundType] = useState<"color" | "gradient" | "image">("color");
  const [backgroundColor, setBackgroundColor] = useState("#f8fafc");
  const [backgroundGradient, setBackgroundGradient] = useState("");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayColor, setOverlayColor] = useState("#000000");
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [blurStrength, setBlurStrength] = useState(0);
  const [widgetBackgroundType, setWidgetBackgroundType] = useState<"default" | "frosted" | "transparent">("default");
  const [widgetOpacity, setWidgetOpacity] = useState(100);

  useEffect(() => {
    if (theme) {
      setBackgroundType((theme.backgroundType as any) || "color");
      setBackgroundColor(theme.backgroundColor || "#f8fafc");
      setBackgroundGradient(theme.backgroundGradient || "");
      setBackgroundImage(theme.backgroundImage || "");
      setOverlayEnabled(theme.overlayEnabled ?? true);
      setOverlayColor(theme.overlayColor || "#000000");
      setOverlayOpacity(theme.overlayOpacity ?? 40);
      setBlurStrength(theme.blurStrength ?? 0);
      setWidgetBackgroundType((theme.widgetBackgroundType as any) || "default");
      setWidgetOpacity(theme.widgetOpacity ?? 100);
    }
  }, [theme]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<DashboardTheme>) => {
      return apiRequest("/api/dashboard-themes", {
        method: "POST",
        body: JSON.stringify({
          dashboardType,
          projectId: projectId || null,
          ...data,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      backgroundType,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      overlayEnabled,
      overlayColor,
      overlayOpacity,
      blurStrength,
      widgetBackgroundType,
      widgetOpacity,
    });
  };

  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBackgroundImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getPreviewBackground = () => {
    if (backgroundType === "color") {
      return { backgroundColor };
    } else if (backgroundType === "gradient") {
      return { background: backgroundGradient };
    } else if (backgroundType === "image" && backgroundImage) {
      return { 
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    return { backgroundColor: "#f8fafc" };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Dashboard Appearance
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div 
            className="relative h-32 rounded-lg border overflow-hidden"
            style={getPreviewBackground()}
          >
            {backgroundType === "image" && overlayEnabled && (
              <div 
                className="absolute inset-0" 
                style={{ 
                  backgroundColor: hexToRgba(overlayColor, overlayOpacity),
                  backdropFilter: blurStrength > 0 ? `blur(${blurStrength}px)` : undefined,
                }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div 
                className={`p-4 rounded-lg border ${
                  widgetBackgroundType === "frosted" 
                    ? "bg-background/80 backdrop-blur-sm" 
                    : widgetBackgroundType === "transparent"
                    ? "bg-transparent border-white/20"
                    : "bg-card"
                }`}
                style={{ opacity: widgetOpacity / 100 }}
              >
                <span className="text-sm font-medium">Widget Preview</span>
              </div>
            </div>
          </div>

          <Tabs value={backgroundType} onValueChange={(v) => setBackgroundType(v as any)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="color" className="gap-2">
                <Palette className="h-4 w-4" />
                Color
              </TabsTrigger>
              <TabsTrigger value="gradient" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Gradient
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-2">
                <Image className="h-4 w-4" />
                Image
              </TabsTrigger>
            </TabsList>

            <TabsContent value="color" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1"
                    placeholder="#f8fafc"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Presets</Label>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setBackgroundColor(preset.color)}
                      className={`h-8 rounded-md border-2 transition-all ${
                        backgroundColor === preset.color ? "border-primary ring-2 ring-primary/20" : "border-transparent"
                      }`}
                      style={{ backgroundColor: preset.color }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="gradient" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Gradient Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  {GRADIENT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setBackgroundGradient(preset.gradient)}
                      className={`h-16 rounded-md border-2 transition-all ${
                        backgroundGradient === preset.gradient ? "border-primary ring-2 ring-primary/20" : "border-transparent"
                      }`}
                      style={{ background: preset.gradient }}
                    >
                      <span className="text-xs text-white font-medium drop-shadow-md">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Custom Gradient (CSS)</Label>
                <Input
                  type="text"
                  value={backgroundGradient}
                  onChange={(e) => setBackgroundGradient(e.target.value)}
                  placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                />
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Upload Image</Label>
                <div className="flex items-center gap-2">
                  <label className="flex-1">
                    <div className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  {backgroundImage && (
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => setBackgroundImage("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {backgroundImage && (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Enable Overlay</Label>
                    <Switch
                      checked={overlayEnabled}
                      onCheckedChange={setOverlayEnabled}
                    />
                  </div>

                  {overlayEnabled && (
                    <>
                      <div className="space-y-2">
                        <Label>Overlay Color</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={overlayColor}
                            onChange={(e) => setOverlayColor(e.target.value)}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={overlayColor}
                            onChange={(e) => setOverlayColor(e.target.value)}
                            className="flex-1"
                            placeholder="#000000"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Overlay Opacity</Label>
                          <span className="text-sm text-muted-foreground">{overlayOpacity}%</span>
                        </div>
                        <Slider
                          value={[overlayOpacity]}
                          onValueChange={([v]) => setOverlayOpacity(v)}
                          min={0}
                          max={80}
                          step={5}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Blur Strength</Label>
                          <span className="text-sm text-muted-foreground">{blurStrength}px</span>
                        </div>
                        <Slider
                          value={[blurStrength]}
                          onValueChange={([v]) => setBlurStrength(v)}
                          min={0}
                          max={20}
                          step={1}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="space-y-4 pt-4 border-t">
            <Label className="text-base font-medium">Widget Style</Label>
            
            <div className="grid grid-cols-3 gap-2">
              {(["default", "frosted", "transparent"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setWidgetBackgroundType(type)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    widgetBackgroundType === type 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-border"
                  }`}
                >
                  <span className="text-sm font-medium capitalize">{type}</span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Widget Opacity</Label>
                <span className="text-sm text-muted-foreground">{widgetOpacity}%</span>
              </div>
              <Slider
                value={[widgetOpacity]}
                onValueChange={([v]) => setWidgetOpacity(v)}
                min={50}
                max={100}
                step={5}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
