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
  // Deposits and withdrawals plus transfers between the household's own accounts.
  netWithTransfers: number;
  closingBalance: number | null;
  // Month-end balance: the recorded closingBalance, or estimated by rolling flows from the nearest one.
  balance: number | null;
  balanceEstimated: boolean;
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

export type FlowEntry = {
  month: string;
  deposits: number;
  withdrawals: number;
  transfersIn: number;
  transfersOut: number;
  closingBalance: number | null;
  note: string | null;
};

export type AccountOption = {
  id: string;
  name: string;
  institution: string;
  entries: FlowEntry[];
};

export type AccountDashboard = {
  accountId: string;
  accountName: string;
  institution: string;
  months: MonthPoint[];
  years: YearPoint[];
  kpis: Kpi[];
  latestLabel: string | null;
};

export type FinanceDashboard = {
  accounts: AccountOption[];
  dashboards: AccountDashboard[];
  firstYear: number;
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

function buildMonths(entries: FlowEntry[]): MonthPoint[] {
  if (entries.length === 0) return [];

  const byMonth = new Map(entries.map((entry) => [entry.month, entry]));
  const first = entries[0].month;
  const last = entries[entries.length - 1].month;
  const months: MonthPoint[] = [];

  for (let month = first; month <= last; month = addMonths(month, 1)) {
    const entry = byMonth.get(month);
    const date = new Date(`${month}T00:00:00Z`);
    const deposits = entry?.deposits ?? 0;
    const withdrawals = entry?.withdrawals ?? 0;
    const transfers = (entry?.transfersIn ?? 0) - (entry?.transfersOut ?? 0);

    months.push({
      month,
      period: month.slice(0, 7),
      label: monthLabel.format(date),
      shortLabel: monthShortLabel.format(date),
      entered: entry !== undefined,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      netWithTransfers: deposits - withdrawals + transfers,
      closingBalance: entry?.closingBalance ?? null,
      balance: entry?.closingBalance ?? null,
      balanceEstimated: false,
      note: entry?.note ?? null,
    });
  }

  return deriveBalances(months);
}

const toCents = (value: number) => Math.round(value * 100);

// Fills balance for months without a recorded closingBalance: forward from the latest earlier anchor
// (balance += net), backward from the first anchor (balance -= next month's net). A month that was
// not entered breaks the chain, since its flows are unknown.
function deriveBalances(months: MonthPoint[]): MonthPoint[] {
  let running: number | null = null;
  for (const point of months) {
    if (point.closingBalance !== null) {
      running = toCents(point.closingBalance);
    } else if (running !== null && point.entered) {
      running += toCents(point.netWithTransfers);
      point.balance = running / 100;
      point.balanceEstimated = true;
    } else {
      running = null;
    }
  }

  const firstAnchor = months.findIndex((point) => point.closingBalance !== null);
  for (let index = firstAnchor - 1; index >= 0; index--) {
    const next = months[index + 1];
    const point = months[index];
    if (!point.entered || !next.entered || next.balance === null) break;
    point.balance = (toCents(next.balance) - toCents(next.netWithTransfers)) / 100;
    point.balanceEstimated = true;
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
  if (!latest) return [];
  const previous = entered[entered.length - 2];
  const lastYear = entered.slice(-12);

  const anchor = [...entered].reverse().find((month) => month.closingBalance !== null);
  const netWorth: Kpi =
    latest.balance !== null
      ? {
          title: "Balance",
          value: formatEur(latest.balance),
          detail:
            latest.balanceEstimated && anchor
              ? `Estimated from ${anchor.label} balance`
              : `Recorded balance, ${latest.label}`,
          badge: `${formatEur(latest.netWithTransfers, { signed: true })} in ${latest.shortLabel}`,
          tone: toneOf(latest.netWithTransfers),
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

export async function getFinanceDashboard(): Promise<FinanceDashboard> {
  const currentYear = new Date().getUTCFullYear();
  const supabase = createAdminClient();
  const householdId = await resolveHouseholdId(supabase);
  if (!householdId) return { accounts: [], dashboards: [], firstYear: currentYear };

  const [accountsResult, flowsResult] = await Promise.all([
    supabase.from("accounts").select("id, name, institution").eq("household_id", householdId).is("archived_at", null),
    supabase
      .from("monthly_account_summary")
      .select("account_id, month, deposits, withdrawals, transfers_in, transfers_out, closing_balance, note")
      .eq("household_id", householdId)
      .order("month", { ascending: true }),
  ]);
  if (accountsResult.error) throw new Error(`Failed to load accounts: ${accountsResult.error.message}`);
  if (flowsResult.error) throw new Error(`Failed to load monthly flows: ${flowsResult.error.message}`);

  const entriesByAccount = new Map<string, FlowEntry[]>();
  for (const row of flowsResult.data) {
    const entry: FlowEntry = {
      month: row.month,
      deposits: Number(row.deposits),
      withdrawals: Number(row.withdrawals),
      transfersIn: Number(row.transfers_in),
      transfersOut: Number(row.transfers_out),
      closingBalance: row.closing_balance === null ? null : Number(row.closing_balance),
      note: row.note,
    };
    entriesByAccount.set(row.account_id, [...(entriesByAccount.get(row.account_id) ?? []), entry]);
  }

  const accounts: AccountOption[] = accountsResult.data
    .map((account) => ({
      id: account.id,
      name: account.name,
      institution: account.institution ?? "Other",
      entries: entriesByAccount.get(account.id) ?? [],
    }))
    .sort((a, b) => a.institution.localeCompare(b.institution) || a.name.localeCompare(b.name));

  const dashboards = accounts.map((account) => {
    const months = buildMonths(account.entries);
    const latest = months[months.length - 1];
    return {
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      months,
      years: buildYears(months),
      kpis: buildKpis(months),
      latestLabel: latest?.label ?? null,
    };
  });

  const firstMonth = flowsResult.data[0]?.month;
  return { accounts, dashboards, firstYear: firstMonth ? Number(firstMonth.slice(0, 4)) : currentYear };
}
