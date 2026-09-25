"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatEur } from "./format";
import {
  type ActionResult,
  type DeleteMonthlyFlowValues,
  deleteMonthlyFlowSchema,
  type MonthlyFlowFormValues,
  monthlyFlowSchema,
} from "./monthly-flow-schema";

// No auth guard yet: these run with the service-role client, so anyone who can reach the app can write.
// Switch to a user-scoped client (RLS) and check the session here once Supabase Auth is wired in.

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function labelOf(month: string) {
  return monthLabel.format(new Date(`${month}T00:00:00Z`));
}

export async function saveMonthlyFlow(input: MonthlyFlowFormValues): Promise<ActionResult> {
  const parsed = monthlyFlowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid monthly flow." };
  }

  const { accountId, month, deposits, withdrawals, closingBalance, note } = parsed.data;
  const supabase = createAdminClient();

  const account = await supabase.from("accounts").select("name, archived_at").eq("id", accountId).maybeSingle();
  if (account.error) return { ok: false, error: `Failed to load account: ${account.error.message}` };
  if (!account.data || account.data.archived_at) return { ok: false, error: "That account no longer exists." };

  // Transfers are left out so an overwrite keeps whatever is already stored.
  const { error } = await supabase
    .from("monthly_flows")
    .upsert(
      { account_id: accountId, month, deposits, withdrawals, closing_balance: closingBalance, note },
      { onConflict: "account_id,month" },
    );
  if (error) return { ok: false, error: `Failed to save monthly flow: ${error.message}` };

  // Work in cents to avoid floating-point drift.
  const net = (Math.round(deposits * 100) - Math.round(withdrawals * 100)) / 100;

  revalidatePath("/dashboard/finance");
  return {
    ok: true,
    message: `Saved ${labelOf(month)} for ${account.data.name} · net ${formatEur(net, { signed: true })}`,
  };
}

export async function deleteMonthlyFlow(input: DeleteMonthlyFlowValues): Promise<ActionResult> {
  const parsed = deleteMonthlyFlowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid monthly flow." };

  const { accountId, month } = parsed.data;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("monthly_flows")
    .delete()
    .eq("account_id", accountId)
    .eq("month", month)
    .select("id");
  if (error) return { ok: false, error: `Failed to delete monthly flow: ${error.message}` };
  if (data.length === 0) return { ok: false, error: `${labelOf(month)} was already deleted.` };

  revalidatePath("/dashboard/finance");
  return { ok: true, message: `Deleted ${labelOf(month)}` };
}
