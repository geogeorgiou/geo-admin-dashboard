import { format } from "date-fns";
import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AddMonthlyFlowDialog } from "./_components/add-monthly-flow-dialog";
import { getFinanceDashboard } from "./_components/finance-data";
import { MonthlyBreakdownCard } from "./_components/monthly-breakdown-card";
import { OverviewKpis } from "./_components/overview-kpis";
import { SpendingOverviewCard } from "./_components/spending-overview-card";

export const metadata: Metadata = {
  title: "Finance",
  description: "Monthly deposits, withdrawals, and savings rate per bank.",
};

export default async function Page() {
  const formattedDate = format(new Date(), "EEEE, do MMMM yyyy");
  const { accounts, dashboards, firstYear } = await getFinanceDashboard();

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Personal Finances</h1>
        <p className="text-muted-foreground text-sm">{formattedDate}</p>
      </div>

      {dashboards.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-xl border border-border border-dashed text-center text-muted-foreground">
          <p>No accounts yet.</p>
          <p className="text-xs">
            Run <code className="font-mono">npm run seed:finances</code> to load them.
          </p>
        </div>
      ) : (
        <Tabs defaultValue={dashboards[0].accountId} className="flex flex-col gap-4">
          <TabsList variant="line">
            {dashboards.map((dashboard) => (
              <TabsTrigger key={dashboard.accountId} value={dashboard.accountId}>
                {dashboard.institution} · {dashboard.accountName}
              </TabsTrigger>
            ))}
          </TabsList>

          {dashboards.map((dashboard) => {
            const addButton = (
              <AddMonthlyFlowDialog accounts={accounts} defaultAccountId={dashboard.accountId} firstYear={firstYear} />
            );

            return (
              <TabsContent key={dashboard.accountId} value={dashboard.accountId} className="flex flex-col gap-4">
                {dashboard.latestLabel === null ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed text-center text-muted-foreground">
                    <div className="space-y-1">
                      <p>No monthly flows for {dashboard.accountName} yet.</p>
                      <p className="text-xs">Add the first month to see its overview.</p>
                    </div>
                    {addButton}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <CalendarCheck className="size-4" />
                        <span>Latest entry: {dashboard.latestLabel}</span>
                      </div>
                      {addButton}
                    </div>

                    <OverviewKpis kpis={dashboard.kpis} />

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                      <div className="xl:col-span-7">
                        <SpendingOverviewCard months={dashboard.months} years={dashboard.years} />
                      </div>
                      <div className="xl:col-span-5">
                        <MonthlyBreakdownCard
                          accountId={dashboard.accountId}
                          accountName={dashboard.accountName}
                          months={dashboard.months}
                        />
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
