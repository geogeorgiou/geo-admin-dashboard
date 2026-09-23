"use client";

import { useState } from "react";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { MonthPoint, YearPoint } from "./finance-data";
import { formatEur } from "./format";

type View = "monthly" | "yearly";

// Same money-in green / money-out red as the Monthly Breakdown table.
const chartConfig = {
  deposits: {
    color: "var(--color-green-500)",
    label: "Deposits",
  },
  withdrawals: {
    color: "var(--destructive)",
    label: "Withdrawals",
  },
} satisfies ChartConfig;

const formatTooltipValue = (value: unknown, average?: number) => {
  if (typeof value !== "number") return value as string;
  const total = formatEur(value, { noDecimals: true });
  return average === undefined ? total : `${total} (${formatEur(average, { noDecimals: true })}/mo)`;
};

export function SpendingOverviewCard({ months, years }: { months: MonthPoint[]; years: YearPoint[] }) {
  const [view, setView] = useState<View>("monthly");

  const monthlyData = months.slice(-12).map((month) => ({
    label: month.shortLabel,
    tooltipLabel: month.entered ? month.label : `${month.label} (not entered)`,
    deposits: month.entered ? month.deposits : null,
    withdrawals: month.entered ? month.withdrawals : null,
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Spending Overview</CardTitle>
        <CardDescription>
          {view === "monthly" ? "Deposits vs withdrawals, last 12 months" : "Totals per year, partial years labelled"}
        </CardDescription>
        <CardAction>
          <Select value={view} onValueChange={(value) => setView(value as View)}>
            <SelectTrigger className="w-28" size="sm" aria-label="Spending overview period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          {view === "monthly" ? (
            <LineChart accessibilityLayer data={monthlyData} margin={{ bottom: 0, left: 12, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} tick={{ fontSize: 12 }} />
              <YAxis hide />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => (
                  <ChartTooltipContent
                    active={active}
                    label={payload?.[0]?.payload.tooltipLabel}
                    payload={payload?.map((item) => ({ ...item, value: formatTooltipValue(item.value) }))}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* Dash on deposits keeps the series apart for red/green colour blindness. */}
              <Line
                dataKey="deposits"
                dot={{ r: 3, fill: "var(--color-deposits)" }}
                stroke="var(--color-deposits)"
                strokeDasharray="6 4"
                strokeLinecap="round"
                strokeWidth={2.5}
                type="monotone"
              />
              <Line
                dataKey="withdrawals"
                dot={{ r: 3, fill: "var(--color-withdrawals)" }}
                stroke="var(--color-withdrawals)"
                strokeLinecap="round"
                strokeWidth={2.5}
                type="monotone"
              />
            </LineChart>
          ) : (
            <BarChart accessibilityLayer data={years} margin={{ bottom: 0, left: 12, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} tick={{ fontSize: 12 }} />
              <YAxis hide />
              <ChartTooltip
                cursor={false}
                content={({ active, payload, label }) => (
                  <ChartTooltipContent
                    active={active}
                    label={label}
                    payload={payload?.map((item) => {
                      const year = item.payload as YearPoint;
                      const average = item.dataKey === "deposits" ? year.avgDeposits : year.avgWithdrawals;
                      return { ...item, value: formatTooltipValue(item.value, average) };
                    })}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="deposits" fill="var(--color-deposits)" radius={4} />
              <Bar dataKey="withdrawals" fill="var(--color-withdrawals)" radius={4} />
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
