// Seeds a household's monthly flows from a JSON export. Safe to re-run: every write is an upsert.
//
//   SEED_OWNER_EMAIL=you@example.com npm run seed:finances -- path/to/monthly_flows.json
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local. The input file holds real
// finance data, so keep it out of git; see fileSchema below for the shape.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "../lib/supabase/database.types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const flowSchema = z.object({
  month: z.string().refine((value) => MONTHS.includes(value.toLowerCase()), "Unknown month name"),
  year: z.number().int().min(1900),
  bank: z.string().min(1),
  bankAccountName: z.string().min(1),
  inflow: z.number().nonnegative(),
  outflow: z.number().nonnegative(),
  net_flow: z.number().optional(),
  closingBalance: z.number().optional(),
  note: z.string().optional(),
});

const fileSchema = z.object({ monthly_flows: z.array(flowSchema).min(1) });

type Client = SupabaseClient<Database>;

function toMonthDate(month: string, year: number) {
  const index = MONTHS.indexOf(month.toLowerCase()) + 1;
  return `${year}-${String(index).padStart(2, "0")}-01`;
}

function unwrap<T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  const { data, error } = result;
  if (error || data === null || data === undefined) {
    throw new Error(`${what}: ${error?.message ?? "no data returned"}`);
  }
  return data;
}

async function findOrCreateUser(supabase: Client, email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`List users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }

  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`Create user: ${error.message}`);
  console.log(`Created auth user ${email}`);
  return data.user.id;
}

async function findOrCreateHousehold(supabase: Client, userId: string, name: string) {
  const memberships = unwrap(
    await supabase.from("household_members").select("household_id").eq("user_id", userId),
    "Load memberships",
  );
  const existing = unwrap(
    await supabase
      .from("households")
      .select("id")
      .in(
        "id",
        memberships.map((row) => row.household_id),
      )
      .eq("name", name)
      .limit(1),
    "Load households",
  );
  if (existing[0]) return existing[0].id;

  const household = unwrap(
    await supabase.from("households").insert({ name }).select("id").single(),
    "Create household",
  );
  unwrap(
    await supabase
      .from("household_members")
      .insert({ household_id: household.id, user_id: userId, role: "owner" })
      .select(),
    "Add owner",
  );
  console.log(`Created household "${name}"`);
  return household.id;
}

async function main() {
  process.loadEnvFile(".env.local");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const householdName = process.env.SEED_HOUSEHOLD_NAME ?? "Georgiou";
  if (!url || !secretKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  if (!ownerEmail) throw new Error("Set SEED_OWNER_EMAIL to the household owner's email");

  if (!process.argv[2]) throw new Error("Pass the monthly flows JSON path: npm run seed:finances -- <path>");
  const inputPath = resolve(process.argv[2]);
  const { monthly_flows: flows } = fileSchema.parse(JSON.parse(readFileSync(inputPath, "utf8")));

  for (const flow of flows) {
    if (flow.net_flow !== undefined && Math.abs(flow.inflow - flow.outflow - flow.net_flow) > 0.005) {
      console.warn(`net_flow mismatch for ${flow.bankAccountName} ${flow.month} ${flow.year}; using inflow - outflow`);
    }
  }

  const supabase = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = await findOrCreateUser(supabase, ownerEmail);
  const householdId = await findOrCreateHousehold(supabase, userId, householdName);

  const accountKeys = new Map(flows.map((flow) => [`${flow.bank}\u0000${flow.bankAccountName}`, flow]));
  const accountIds = new Map<string, string>();

  for (const [key, flow] of accountKeys) {
    const account = unwrap(
      await supabase
        .from("accounts")
        .upsert(
          { household_id: householdId, name: flow.bankAccountName, institution: flow.bank },
          { onConflict: "household_id,name" },
        )
        .select("id")
        .single(),
      `Upsert account ${flow.bankAccountName}`,
    );
    accountIds.set(key, account.id);

    unwrap(
      await supabase
        .from("account_holders")
        .upsert({ account_id: account.id, user_id: userId }, { onConflict: "account_id,user_id" })
        .select(),
      `Add holder to ${flow.bankAccountName}`,
    );
  }

  const rows = flows.map((flow) => ({
    account_id: accountIds.get(`${flow.bank}\u0000${flow.bankAccountName}`) as string,
    month: toMonthDate(flow.month, flow.year),
    deposits: flow.inflow,
    withdrawals: flow.outflow,
    closing_balance: flow.closingBalance ?? null,
    note: flow.note ?? null,
  }));

  const saved = unwrap(
    await supabase.from("monthly_flows").upsert(rows, { onConflict: "account_id,month" }).select("id"),
    "Upsert monthly flows",
  );

  console.log(`Seeded ${saved.length} monthly rows across ${accountIds.size} account(s) for household ${householdId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
