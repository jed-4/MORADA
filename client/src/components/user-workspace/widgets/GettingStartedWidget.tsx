import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle2, Circle, ChevronRight, PartyPopper } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { cn } from "@/lib/utils";
import type { Project, Contact, Estimate, User } from "@shared/schema";

interface DemoStatus {
  seeded: boolean;
  demoProjectNames?: string[];
  demoContactNames?: string[];
}

/**
 * First-run checklist: the four actions that take a new company from demo
 * data to really using Morada. Each step self-ticks off real (non-demo) data
 * and deep-links to the right page. Remove the widget once you're rolling.
 */
export default function GettingStartedWidget(_props: WidgetProps) {
  const [, setLocation] = useLocation();

  const { data: demoStatus } = useQuery<DemoStatus>({
    queryKey: ["/api/demo-data/status"],
    staleTime: 5 * 60 * 1000,
  });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: estimates = [] } = useQuery<Estimate[]>({ queryKey: ["/api/estimates"] });
  // 403s for non-admins — that's fine, the invite step just shows as not done.
  const { data: teamUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    retry: false,
  });

  const steps = useMemo(() => {
    const demoProjectNames = new Set(demoStatus?.demoProjectNames ?? []);
    const demoContactNames = new Set(demoStatus?.demoContactNames ?? []);
    const demoProjectIds = new Set(
      projects.filter((p) => demoProjectNames.has(p.name)).map((p) => p.id),
    );

    return [
      {
        key: "project",
        label: "Create your first project",
        hint: "Everything for a job lives in its project",
        href: "/business/projects",
        done: projects.some((p) => !demoProjectNames.has(p.name)),
      },
      {
        key: "contact",
        label: "Add a contact",
        hint: "Clients, subbies and suppliers",
        href: "/contacts",
        done: contacts.some((c) => !demoContactNames.has(c.name ?? "")),
      },
      {
        key: "estimate",
        label: "Build an estimate",
        hint: "Price a job and send it to your client",
        href: "/estimates",
        done: estimates.some((e) => e.projectId && !demoProjectIds.has(e.projectId)),
      },
      {
        key: "team",
        label: "Invite your team",
        hint: "Get your crew into Morada",
        href: "/business-team",
        done: teamUsers.length > 1,
      },
    ];
  }, [demoStatus, projects, contacts, estimates, teamUsers]);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <div className="flex h-full flex-col gap-1 p-1" data-testid="widget-getting-started">
      {allDone ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-4">
          <PartyPopper className="h-6 w-6 text-primary" />
          <p className="text-sm font-medium">You're all set up!</p>
          <p className="text-xs text-muted-foreground">
            You can remove this widget from the menu in its top-right corner.
          </p>
        </div>
      ) : (
        <>
          <p className="px-2 pt-1 text-xs text-muted-foreground" data-testid="text-getting-started-progress">
            {doneCount} of {steps.length} done
          </p>
          <ul className="flex flex-col">
            {steps.map((step) => (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => setLocation(step.href)}
                  className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-muted/60"
                  data-testid={`button-getting-started-${step.key}`}
                >
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "block text-sm",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {step.label}
                    </span>
                    {!step.done && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {step.hint}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
