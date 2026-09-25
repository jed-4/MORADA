import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, FolderOpen, LineChart, Loader2, Receipt, Settings2 } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import type { PeriodGranularity } from "@shared/cashflow";
import { ForecastTab } from "@/components/cashflow/ForecastTab";
import { ProjectsTab } from "@/components/cashflow/ProjectsTab";
import { ExpensesTab } from "@/components/cashflow/ExpensesTab";
import { SettingsDialog } from "@/components/cashflow/SettingsDialog";
import { WhatIfsTab } from "@/components/cashflow/WhatIfsTab";
import {
  forecastKey,
  HORIZON_MONTHS,
  SETTINGS_KEY,
  type ForecastResponse,
  type HorizonMonths,
  type SettingsResponse,
} from "@/components/cashflow/cashflowShared";

type TabId = "forecast" | "projects" | "expenses" | "whatifs";

const TABS: { id: TabId; label: string; Icon: typeof LineChart }[] = [
  { id: "forecast", label: "Forecast", Icon: LineChart },
  { id: "projects", label: "Projects", Icon: FolderOpen },
  { id: "expenses", label: "Business expenses", Icon: Receipt },
  { id: "whatifs", label: "What-ifs", Icon: FlaskConical },
];

const HORIZON_STORAGE_KEY = "morada.cashflow.horizonMonths";

/** The viewer's last horizon — a per-browser convenience, so storage may be unavailable. */
function readHorizon(): HorizonMonths {
  try {
    const n = Number(localStorage.getItem(HORIZON_STORAGE_KEY));
    return (HORIZON_MONTHS as readonly number[]).includes(n) ? (n as HorizonMonths) : 12;
  } catch {
    return 12;
  }
}

function ForecastPanel({ period, months, view }: { period: PeriodGranularity; months: HorizonMonths; view: "forecast" | "whatifs" }) {
  const { data, isLoading, error } = useQuery<ForecastResponse>({ queryKey: forecastKey(period, months) });
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        Working out the forecast…
      </div>
    );
  }
  if (error || !data) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Couldn't build the forecast.</p>;
  }
  return view === "whatifs" ? <WhatIfsTab data={data} /> : <ForecastTab data={data} />;
}

export default function BusinessCashflow() {
  const [activeTab, setActiveTab] = useState<TabId>("forecast");
  const [period, setPeriod] = useState<PeriodGranularity | null>(null);
  const [months, setMonthsState] = useState<HorizonMonths>(readHorizon);
  const setMonths = (m: HorizonMonths) => {
    setMonthsState(m);
    try {
      localStorage.setItem(HORIZON_STORAGE_KEY, String(m));
    } catch {
      /* private window — the choice just won't be remembered */
    }
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEditSettings = usePermission("business.cashflow", "edit");

  // Start on the company's default period; the toggle overrides it for this visit.
  const { data: settingsData, isError: settingsFailed } = useQuery<SettingsResponse>({ queryKey: SETTINGS_KEY });
  useEffect(() => {
    if (period != null) return;
    if (settingsData) setPeriod(settingsData.settings.defaultPeriod === "fortnight" ? "fortnight" : "month");
    else if (settingsFailed) setPeriod("month");
  }, [settingsData, settingsFailed, period]);

  return (
    <div className="flex flex-col gap-4 p-4 min-h-full bg-background" data-testid="page-cashflow">
      <div className="flex items-center justify-between gap-2 border-b border-border">
        <div className="flex items-center gap-1">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                data-testid={`tab-cashflow-${id}`}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs transition-colors flex-shrink-0 cursor-pointer bg-transparent border-0",
                  isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground font-medium",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {isActive && <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          {(activeTab === "forecast" || activeTab === "whatifs") && (
            <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5" title="How far ahead to forecast">
              {HORIZON_MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={cn("h-6 px-2 text-xs rounded tabular-nums", months === m ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                  data-testid={`toggle-horizon-${m}`}
                >
                  {m} mo
                </button>
              ))}
            </div>
          )}
          {activeTab === "forecast" && (
            <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
              {(["fortnight", "month"] as PeriodGranularity[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn("h-6 px-2.5 text-xs rounded", (period ?? "month") === p ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                  data-testid={`toggle-period-${p}`}
                >
                  {p === "month" ? "Monthly" : "Fortnightly"}
                </button>
              ))}
            </div>
          )}
          {canEditSettings && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="h-6 w-auto px-2 text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1"
              data-testid="button-cashflow-settings"
            >
              <Settings2 className="w-3.5 h-3.5" />Settings
            </button>
          )}
        </div>
      </div>

      {activeTab === "forecast" &&
        (period ? (
          <ForecastPanel period={period} months={months} view="forecast" />
        ) : (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ))}
      {activeTab === "projects" && <ProjectsTab />}
      {activeTab === "expenses" && <ExpensesTab />}
      {activeTab === "whatifs" && (period ? <ForecastPanel period={period} months={months} view="whatifs" /> : null)}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
