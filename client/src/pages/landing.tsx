import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, CheckCircle2, Calendar, FileText, DollarSign, Users } from "lucide-react";
import { SiReplit } from "react-icons/si";

export default function LandingPage() {
  const handleLogin = () => {
    window.location.href = '/api/login';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" data-testid="logo-icon" />
            <span className="text-2xl font-bold text-foreground" data-testid="text-logo">BuildPro</span>
          </div>
          <Button 
            onClick={handleLogin}
            variant="default"
            className="gap-2"
            data-testid="button-login-header"
          >
            <SiReplit className="h-4 w-4" />
            Login with Replit
          </Button>
        </header>

        <main className="py-12 sm:py-20">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl" data-testid="text-hero-title">
              Project Management for{" "}
              <span className="text-primary">Australian Builders</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground" data-testid="text-hero-subtitle">
              Streamline your residential construction projects with comprehensive tools for estimates, schedules, budgets, and team collaboration.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button 
                onClick={handleLogin}
                size="lg"
                className="gap-2 text-base"
                data-testid="button-login-hero"
              >
                <SiReplit className="h-5 w-5" />
                Get Started with Replit
              </Button>
            </div>
          </div>

          <div className="mt-20">
            <h2 className="text-center text-3xl font-bold text-foreground" data-testid="text-features-title">
              Everything you need to manage construction projects
            </h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                icon={<FileText className="h-6 w-6" />}
                title="Estimates & Proposals"
                description="Create detailed estimates with unlimited hierarchical grouping, CSV/Excel import, and professional PDF proposals."
                testId="feature-estimates"
              />
              <FeatureCard
                icon={<Calendar className="h-6 w-6" />}
                title="Schedule Management"
                description="Manage project timelines with list, calendar, and Gantt chart views. Track tasks and milestones effortlessly."
                testId="feature-schedule"
              />
              <FeatureCard
                icon={<DollarSign className="h-6 w-6" />}
                title="Budget Tracking"
                description="Monitor project costs with comprehensive budget tracking, bill management, and financial reporting."
                testId="feature-budget"
              />
              <FeatureCard
                icon={<CheckCircle2 className="h-6 w-6" />}
                title="Task Management"
                description="Organize work with Kanban boards, lists, and calendar views. Assign tasks and track progress in real-time."
                testId="feature-tasks"
              />
              <FeatureCard
                icon={<Users className="h-6 w-6" />}
                title="Team Collaboration"
                description="Manage team members, clients, and suppliers in one place. Share updates and coordinate work efficiently."
                testId="feature-collaboration"
              />
              <FeatureCard
                icon={<Building2 className="h-6 w-6" />}
                title="Multi-Project Dashboard"
                description="Customizable dashboard with widgets for tasks, schedules, notes, and checklists. Track multiple projects at once."
                testId="feature-dashboard"
              />
            </div>
          </div>

          <div className="mt-20 text-center">
            <Card className="mx-auto max-w-3xl">
              <CardContent className="p-12">
                <h2 className="text-2xl font-bold text-foreground" data-testid="text-cta-title">
                  Ready to streamline your construction projects?
                </h2>
                <p className="mt-4 text-lg text-muted-foreground" data-testid="text-cta-description">
                  Sign in with Replit to set up your company and start managing projects today.
                </p>
                <Button 
                  onClick={handleLogin}
                  size="lg"
                  className="mt-8 gap-2 text-base"
                  data-testid="button-login-cta"
                >
                  <SiReplit className="h-5 w-5" />
                  Login with Replit
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>

        <footer className="border-t py-8 mt-20">
          <p className="text-center text-sm text-muted-foreground" data-testid="text-footer">
            BuildPro &copy; {new Date().getFullYear()} - Project Management for Australian Residential Builders
          </p>
        </footer>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
}

function FeatureCard({ icon, title, description, testId }: FeatureCardProps) {
  return (
    <Card data-testid={`card-${testId}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary" data-testid={`icon-${testId}`}>
            {icon}
          </div>
          <h3 className="text-lg font-bold text-foreground" data-testid={`text-${testId}-title`}>
            {title}
          </h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground" data-testid={`text-${testId}-description`}>
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
