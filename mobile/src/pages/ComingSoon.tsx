import { MobileHeader } from "@/components/MobileHeader";
import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col h-full">
      <MobileHeader title={title} showBack={true} showMore={false} showNotifications={false} />
      
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Construction className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-3">{title}</h2>
          <p className="text-muted-foreground mb-6">
            {description || `The ${title} feature is coming soon!`}
          </p>
          <p className="text-sm text-muted-foreground">
            We're working hard to bring you this feature. Check back soon!
          </p>
        </div>
      </main>
    </div>
  );
}
