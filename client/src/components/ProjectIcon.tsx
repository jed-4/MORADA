import * as LucideIcons from "lucide-react";

interface ProjectIconProps {
  icon?: string | null;
  color?: string | null;
  className?: string;
}

export function ProjectIcon({ icon, color = "#3b82f6", className = "w-4 h-4" }: ProjectIconProps) {
  const iconColor = color || "#3b82f6";
  
  if (icon) {
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[icon];
    
    if (IconComponent) {
      return <IconComponent className={className} style={{ color: iconColor }} data-testid="project-icon" />;
    }
  }
  
  return (
    <div
      className={className}
      style={{ backgroundColor: iconColor }}
      data-testid="project-icon-square"
    />
  );
}
