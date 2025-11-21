import { AlertCircle } from "lucide-react";

interface ComingSoonTabProps {
  title: string;
}

export function ProjectComingSoonTab({ title }: ComingSoonTabProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-3">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          This feature is coming soon
        </p>
      </div>
    </div>
  );
}
