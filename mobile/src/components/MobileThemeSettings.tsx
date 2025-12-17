import { useState, useEffect } from "react";
import { BottomSheet } from "./BottomSheet";
import { MobileButton as Button } from "@/components/ui/MobileButton";
import { Check, Image, Palette as PaletteIcon, Sparkles, Copy } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { DashboardTheme } from "@shared/schema";

interface MobileThemeSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  dashboardType: "user" | "business";
}

const colorPresets = [
  { id: "default", name: "Default", color: "" },
  { id: "blue", name: "Blue", color: "#3b82f6" },
  { id: "purple", name: "Purple", color: "#8b5cf6" },
  { id: "green", name: "Green", color: "#22c55e" },
  { id: "orange", name: "Orange", color: "#f97316" },
  { id: "pink", name: "Pink", color: "#ec4899" },
  { id: "slate", name: "Slate", color: "#64748b" },
];

const gradientPresets = [
  { id: "blue-purple", name: "Blue to Purple", gradient: "linear-gradient(135deg, #3b82f6, #8b5cf6)" },
  { id: "green-teal", name: "Green to Teal", gradient: "linear-gradient(135deg, #22c55e, #14b8a6)" },
  { id: "orange-pink", name: "Orange to Pink", gradient: "linear-gradient(135deg, #f97316, #ec4899)" },
  { id: "slate-blue", name: "Slate to Blue", gradient: "linear-gradient(135deg, #64748b, #3b82f6)" },
];

export function MobileThemeSettings({ isOpen, onClose, dashboardType }: MobileThemeSettingsProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<"color" | "gradient">("color");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedGradient, setSelectedGradient] = useState<string>("");

  const userThemeQueryKey = ['/api/dashboard-themes/user'];
  const businessThemeQueryKey = ['/api/dashboard-themes/business'];

  const { data: currentTheme, isLoading: isLoadingTheme } = useQuery<DashboardTheme | null>({
    queryKey: dashboardType === "user" ? userThemeQueryKey : businessThemeQueryKey,
    enabled: isOpen,
  });

  const { data: otherTheme } = useQuery<DashboardTheme | null>({
    queryKey: dashboardType === "user" ? businessThemeQueryKey : userThemeQueryKey,
    enabled: isOpen,
  });

  useEffect(() => {
    if (currentTheme && isOpen) {
      if (currentTheme.backgroundType === "gradient" && currentTheme.backgroundGradient) {
        setSelectedType("gradient");
        setSelectedGradient(currentTheme.backgroundGradient);
        setSelectedColor("");
      } else if (currentTheme.backgroundType === "color" && currentTheme.backgroundColor) {
        setSelectedType("color");
        setSelectedColor(currentTheme.backgroundColor);
        setSelectedGradient("");
      } else {
        setSelectedType("color");
        setSelectedColor("");
        setSelectedGradient("");
      }
    }
  }, [currentTheme, isOpen]);

  const updateThemeMutation = useMutation({
    mutationFn: async (themeData: Partial<DashboardTheme>) => {
      return apiRequest("/api/dashboard-themes", "POST", {
        ...themeData,
        dashboardType: dashboardType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardType === "user" ? userThemeQueryKey : businessThemeQueryKey });
      toast({
        title: "Theme updated",
        description: "Your dashboard theme has been updated successfully.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update theme",
        variant: "destructive",
      });
    },
  });

  const handleApplyTheme = () => {
    if (selectedType === "color" && selectedColor) {
      updateThemeMutation.mutate({
        backgroundType: "color",
        backgroundColor: selectedColor,
        backgroundGradient: null,
        backgroundImage: null,
      });
    } else if (selectedType === "gradient" && selectedGradient) {
      updateThemeMutation.mutate({
        backgroundType: "gradient",
        backgroundGradient: selectedGradient,
        backgroundColor: null,
        backgroundImage: null,
      });
    } else if (selectedColor === "" && selectedType === "color") {
      updateThemeMutation.mutate({
        backgroundType: "color",
        backgroundColor: null,
        backgroundGradient: null,
        backgroundImage: null,
      });
    }
  };

  const handleResetTheme = () => {
    updateThemeMutation.mutate({
      backgroundType: "color",
      backgroundColor: null,
      backgroundGradient: null,
      backgroundImage: null,
      overlayEnabled: false,
    });
  };

  const handleCopyFromOther = () => {
    if (!otherTheme) {
      toast({
        title: "No theme to copy",
        description: `The ${dashboardType === "user" ? "business" : "personal"} dashboard has no custom theme.`,
        variant: "destructive",
      });
      return;
    }

    updateThemeMutation.mutate({
      backgroundType: otherTheme.backgroundType,
      backgroundColor: otherTheme.backgroundColor,
      backgroundGradient: otherTheme.backgroundGradient,
      backgroundImage: otherTheme.backgroundImage,
      overlayEnabled: otherTheme.overlayEnabled,
      overlayColor: otherTheme.overlayColor,
      overlayOpacity: otherTheme.overlayOpacity,
      blurStrength: otherTheme.blurStrength,
    });
  };

  const hasOtherTheme = otherTheme && (otherTheme.backgroundColor || otherTheme.backgroundGradient || otherTheme.backgroundImage);
  const copyLabel = dashboardType === "user" ? "Copy from Business" : "Copy from Personal";

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Theme Settings">
      <div className="p-4 space-y-6">
        <div className="flex gap-2">
          <Button
            variant={selectedType === "color" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setSelectedType("color")}
            data-testid="button-theme-type-color"
          >
            <PaletteIcon className="w-4 h-4 mr-2" />
            Solid Color
          </Button>
          <Button
            variant={selectedType === "gradient" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setSelectedType("gradient")}
            data-testid="button-theme-type-gradient"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Gradient
          </Button>
        </div>

        {selectedType === "color" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a background color:</p>
            <div className="grid grid-cols-4 gap-3">
              {colorPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedColor(preset.color)}
                  className={`relative aspect-square rounded-lg border-2 transition-all ${
                    selectedColor === preset.color 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-border hover:border-primary/50"
                  }`}
                  style={{ backgroundColor: preset.color || "var(--background)" }}
                  data-testid={`color-preset-${preset.id}`}
                >
                  {selectedColor === preset.color && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white drop-shadow-md" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedType === "gradient" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a gradient:</p>
            <div className="grid grid-cols-2 gap-3">
              {gradientPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedGradient(preset.gradient)}
                  className={`relative h-16 rounded-lg border-2 transition-all ${
                    selectedGradient === preset.gradient 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-border hover:border-primary/50"
                  }`}
                  style={{ background: preset.gradient }}
                  data-testid={`gradient-preset-${preset.id}`}
                >
                  {selectedGradient === preset.gradient && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white drop-shadow-md" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-2 text-[10px] text-white/80 font-medium drop-shadow">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasOtherTheme && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleCopyFromOther}
            disabled={updateThemeMutation.isPending}
            data-testid="button-copy-theme"
          >
            <Copy className="w-4 h-4 mr-2" />
            {copyLabel}
          </Button>
        )}

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md flex items-start gap-2">
          <Image className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>For custom images and advanced overlay options, visit BuildPro on desktop.</span>
        </div>

        <div className="flex gap-3 pt-2">
          <Button 
            variant="outline" 
            className="flex-1" 
            onClick={handleResetTheme}
            disabled={updateThemeMutation.isPending}
            data-testid="button-reset-theme"
          >
            Reset
          </Button>
          <Button 
            className="flex-1" 
            onClick={handleApplyTheme}
            disabled={updateThemeMutation.isPending || (!selectedColor && !selectedGradient && selectedType !== "color")}
            data-testid="button-apply-theme"
          >
            {updateThemeMutation.isPending ? "Applying..." : "Apply Theme"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
