import { format } from "date-fns";
import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getBankDashboards } from "./_components/finance-data";
import { MonthlyBreakdownCard } from "./_components/monthly-breakdown-card";
import { OverviewKpis } from "./_components/overview-kpis";
import { SpendingOverviewCard } from "./_components/spending-overview-card";

export const metadata: Metadata = {
  title: "Finance",
  description: "Monthly deposits, withdrawals, and savings rate per bank.",
};

export default async function Page() {
  const formattedDate = format(new Date(), "EEEE, do MMMM yyyy");
  const banks = await getBankDashboards();

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Personal Finances</h1>
        <p className="text-muted-foreground text-sm">{formattedDate}</p>
      </div>

      {banks.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-xl border border-border border-dashed text-center text-muted-foreground">
          <p>No monthly flows yet.</p>
          <p className="text-xs">
            Run <code className="font-mono">npm run seed:finances</code> to load them.
          </p>
        </div>
      ) : (
        <Tabs defaultValue={banks[0].institution} className="flex flex-col gap-4">
          <TabsList variant="line">
            {banks.map((bank) => (
              <TabsTrigger key={bank.institution} value={bank.institution}>
                {bank.institution} Dashboard
              </TabsTrigger>
            ))}
          </TabsList>

          {banks.map((bank) => (
            <TabsContent key={bank.institution} value={bank.institution} className="flex flex-col gap-4">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <CalendarCheck className="size-4" />
                <span>
                  Latest entry: {bank.latestLabel} · {bank.accountCount} account{bank.accountCount === 1 ? "" : "s"}
                </span>
              </div>

              <OverviewKpis kpis={bank.kpis} />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-7">
                  <SpendingOverviewCard months={bank.months} years={bank.years} />
                </div>
                <div className="xl:col-span-5">
                  <MonthlyBreakdownCard months={bank.months} />
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
