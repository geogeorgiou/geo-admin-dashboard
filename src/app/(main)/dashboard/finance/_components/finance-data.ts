import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatEur } from "./format";

export type MonthPoint = {
  month: string;
  period: string;
  label: string;
  shortLabel: string;
  entered: boolean;
  deposits: number;
  withdrawals: number;
  net: number;
  closingBalance: number | null;
  note: string | null;
};

export type YearPoint = {
  year: number;
  label: string;
  months: number;
  deposits: number;
  withdrawals: number;
  avgDeposits: number;
  avgWithdrawals: number;
};

export type Tone = "positive" | "negative" | "neutral";

export type Kpi = {
  title: string;
  value: string;
  detail: string;
  badge: string | null;
  tone: Tone;
};

export type BankDashboard = {
  institution: string;
  accountCount: number;
  months: MonthPoint[];
  years: YearPoint[];
  kpis: Kpi[];
  latestLabel: string;
};

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const monthShortLabel = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
function toneOf(value: number, higherIsBetter = true): Tone {
  if (value === 0) return "neutral";
  return value > 0 === higherIsBetter ? "positive" : "negative";
}

function formatPercent(value: number, opts?: { signed?: boolean }) {
  const formatted = `${value.toFixed(1)}%`;
  return opts?.signed && value > 0 ? `+${formatted}` : formatted;
}

function savingsRate(deposits: number, withdrawals: number) {
  return deposits > 0 ? ((deposits - withdrawals) / deposits) * 100 : null;
}

function addMonths(month: string, count: number) {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 10);
}

function buildMonths(rows: FlowRow[], activeAccounts: number): MonthPoint[] {
  const byMonth = new Map<string, FlowRow[]>();
  for (const row of rows) {
    byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row]);
  }

  const sorted = [...byMonth.keys()].sort();
  const months: MonthPoint[] = [];

  for (let month = sorted[0]; month <= sorted[sorted.length - 1]; month = addMonths(month, 1)) {
    const entries = byMonth.get(month) ?? [];
    const deposits = entries.reduce((sum, row) => sum + row.deposits, 0);
    const withdrawals = entries.reduce((sum, row) => sum + row.withdrawals, 0);
    const balances = entries.flatMap((row) => (row.closing_balance === null ? [] : [row.closing_balance]));
    const date = new Date(`${month}T00:00:00Z`);

    months.push({
      month,
      period: month.slice(0, 7),
      label: monthLabel.format(date),
      shortLabel: monthShortLabel.format(date),
      entered: entries.length > 0,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      // Only a real net worth when every active account reported a balance.
      closingBalance:
        balances.length > 0 && balances.length >= activeAccounts
          ? balances.reduce((sum, value) => sum + value, 0)
          : null,
      note:
        entries
          .map((row) => row.note)
          .filter(Boolean)
          .join(" · ") || null,
    });
  }

  return months;
}

function buildYears(months: MonthPoint[]): YearPoint[] {
  const byYear = new Map<number, MonthPoint[]>();
  for (const point of months.filter((month) => month.entered)) {
    const year = Number(point.month.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), point]);
  }

  return [...byYear.entries()].map(([year, points]) => {
    const deposits = points.reduce((sum, point) => sum + point.deposits, 0);
    const withdrawals = points.reduce((sum, point) => sum + point.withdrawals, 0);
    return {
      year,
      label: points.length < 12 ? `${year} (${points.length} mo)` : String(year),
      months: points.length,
      deposits,
      withdrawals,
      avgDeposits: deposits / points.length,
      avgWithdrawals: withdrawals / points.length,
    };
  });
}

function buildKpis(months: MonthPoint[]): Kpi[] {
  const entered = months.filter((month) => month.entered);
  const latest = entered[entered.length - 1];
  const previous = entered[entered.length - 2];
  const lastYear = entered.slice(-12);

  const netWorth: Kpi =
    latest.closingBalance !== null
      ? {
          title: "Net worth",
          value: formatEur(latest.closingBalance),
          detail:
            previous?.closingBalance != null
              ? `${formatEur(latest.closingBalance - previous.closingBalance, { signed: true })} vs ${previous.shortLabel}`
              : `Month-end balance, ${latest.label}`,
          badge: formatEur(latest.net, { signed: true }),
          tone: toneOf(latest.net),
        }
      : {
          title: "Net change",
          value: formatEur(
            entered.reduce((sum, month) => sum + month.net, 0),
            { signed: true },
          ),
          detail: `Since ${entered[0].label}. Add month-end balances for net worth.`,
          badge: `${formatEur(latest.net, { signed: true })} in ${latest.shortLabel}`,
          tone: toneOf(latest.net),
        };

  const spendChange = previous ? latest.withdrawals - previous.withdrawals : 0;
  const monthlySpend: Kpi = {
    title: "Monthly spend",
    value: formatEur(latest.withdrawals),
    detail: previous
      ? `${formatEur(Math.abs(spendChange))} ${spendChange >= 0 ? "more" : "less"} than ${previous.shortLabel}`
      : latest.label,
    badge:
      previous && previous.withdrawals > 0
        ? formatPercent((spendChange / previous.withdrawals) * 100, { signed: true })
        : null,
    tone: toneOf(spendChange, false),
  };

  const rate = savingsRate(latest.deposits, latest.withdrawals);
  const previousRate = previous ? savingsRate(previous.deposits, previous.withdrawals) : null;
  const averageRate = savingsRate(
    lastYear.reduce((sum, month) => sum + month.deposits, 0),
    lastYear.reduce((sum, month) => sum + month.withdrawals, 0),
  );
  const rateChange = rate !== null && previousRate !== null ? rate - previousRate : null;
  const savings: Kpi = {
    title: "Savings rate",
    value: rate === null ? "—" : formatPercent(rate),
    detail: averageRate === null ? latest.label : `${lastYear.length}-mo avg ${formatPercent(averageRate)}`,
    badge: rateChange === null ? null : `${rateChange > 0 ? "+" : ""}${rateChange.toFixed(1)} pp`,
    tone: rateChange === null ? "neutral" : toneOf(rateChange),
  };

  return [netWorth, monthlySpend, savings];
}

type FlowRow = {
  account_id: string;
  institution: string | null;
  month: string;
  deposits: number;
  withdrawals: number;
  closing_balance: number | null;
  note: string | null;
};

async function resolveHouseholdId(supabase: ReturnType<typeof createAdminClient>) {
  const configured = process.env.FINANCE_HOUSEHOLD_ID;
  if (configured) return configured;

  // Without auth there is no "current user": fall back to the oldest household.
  const { data, error } = await supabase
    .from("households")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Failed to load households: ${error.message}`);
  return data[0]?.id ?? null;
}

export async function getBankDashboards(): Promise<BankDashboard[]> {
  const supabase = createAdminClient();
  const householdId = await resolveHouseholdId(supabase);
  if (!householdId) return [];

  const [accountsResult, flowsResult] = await Promise.all([
    supabase.from("accounts").select("id, institution, archived_at").eq("household_id", householdId),
    supabase
      .from("monthly_account_summary")
      .select("account_id, institution, month, deposits, withdrawals, closing_balance, note")
      .eq("household_id", householdId)
      .order("month", { ascending: true }),
  ]);
  if (accountsResult.error) throw new Error(`Failed to load accounts: ${accountsResult.error.message}`);
  if (flowsResult.error) throw new Error(`Failed to load monthly flows: ${flowsResult.error.message}`);

  const byInstitution = new Map<string, FlowRow[]>();
  for (const row of flowsResult.data) {
    const institution = row.institution ?? "Other";
    byInstitution.set(institution, [...(byInstitution.get(institution) ?? []), row]);
  }

  return [...byInstitution.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([institution, rows]) => {
      const accounts = accountsResult.data.filter((account) => (account.institution ?? "Other") === institution);
      const months = buildMonths(rows, accounts.filter((account) => !account.archived_at).length);
      const entered = months.filter((month) => month.entered);
      return {
        institution,
        accountCount: accounts.length,
        months,
        years: buildYears(months),
        kpis: buildKpis(months),
        latestLabel: entered[entered.length - 1].label,
      };
    });
}
