import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { Kpi, Tone } from "./finance-data";

const badgeTone: Record<Tone, string> = {
  positive: "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  negative: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function OverviewKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {kpis.map((kpi, index) => (
          <Card
            key={kpi.title}
            className={cn(
              "gap-5 overflow-hidden rounded-none border-0 border-foreground/10 ring-0",
              index < kpis.length - 1 && "border-b md:border-r md:border-b-0",
            )}
          >
            <CardHeader>
              <CardTitle className="font-normal">{kpi.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="text-3xl tabular-nums leading-none tracking-tight">{kpi.value}</div>
                <p className="text-muted-foreground text-xs">{kpi.detail}</p>
              </div>
              {kpi.badge && <Badge className={cn("shrink-0 tabular-nums", badgeTone[kpi.tone])}>{kpi.badge}</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
