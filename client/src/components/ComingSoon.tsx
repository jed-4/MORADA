import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  estimatedDate?: string;
  icon?: React.ReactNode;
}

export default function ComingSoon({ title, description, estimatedDate, icon }: ComingSoonProps) {
  return (
    <div className="p-6" data-testid={`coming-soon-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {icon ? (
              <div className="text-muted-foreground">{icon}</div>
            ) : (
              <Clock className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{description}</p>
          <div className="space-y-2">
            <Badge variant="secondary" className="text-sm">
              Coming Soon
            </Badge>
            {estimatedDate && (
              <p className="text-sm text-muted-foreground">
                Expected: {estimatedDate}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}