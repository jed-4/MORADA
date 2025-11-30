import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  const getLabel = () => {
    switch (theme) {
      case "light":
        return "Light mode";
      case "dark":
        return "Dark mode";
      case "system":
        return "System theme";
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          data-testid="button-theme-toggle"
        >
          {theme === "light" && (
            <Sun className="h-4 w-4" />
          )}
          {theme === "dark" && (
            <Moon className="h-4 w-4" />
          )}
          {theme === "system" && (
            <Monitor className="h-4 w-4" />
          )}
          <span className="sr-only">{getLabel()}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{getLabel()} (click to change)</p>
      </TooltipContent>
    </Tooltip>
  );
}
