import { z } from "zod";

// numeric(14, 2) in monthly_flows.
const MAX_AMOUNT = 999_999_999_999.99;
const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;
const SIGNED_AMOUNT_PATTERN = /^-?\d+([.,]\d{1,2})?$/;

function toNumber(value: string) {
  return Number(value.replace(",", "."));
}

const amount = z
  .string()
  .trim()
  .min(1, "Enter an amount, or 0 for none.")
  .regex(AMOUNT_PATTERN, "Use a positive amount or 0, with up to 2 decimals.")
  .transform(toNumber)
  .refine((value) => value <= MAX_AMOUNT, "Amount is too large.");

const optionalSignedAmount = z
  .string()
  .trim()
  .refine((value) => value === "" || SIGNED_AMOUNT_PATTERN.test(value), "Use an amount with up to 2 decimals.")
  .transform((value) => (value === "" ? null : toNumber(value)))
  .refine((value) => value === null || Math.abs(value) <= MAX_AMOUNT, "Amount is too large.");

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// First day of the month, as stored in monthly_flows.month.
export function toMonthDate(year: string | number, month: string | number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function isFutureMonth(monthDate: string, now = new Date()) {
  return monthDate > toMonthDate(now.getFullYear(), now.getMonth() + 1);
}

export const monthlyFlowSchema = z
  .object({
    accountId: z.uuid("Select an account."),
    year: z.string().regex(/^\d{4}$/, "Select a year."),
    month: z.string().regex(/^([1-9]|1[0-2])$/, "Select a month."),
    deposits: amount,
    withdrawals: amount,
    closingBalance: optionalSignedAmount,
    note: z
      .string()
      .trim()
      .max(500, "Keep the note under 500 characters.")
      .transform((value) => value || null),
  })
  .refine((values) => !isFutureMonth(toMonthDate(values.year, values.month)), {
    message: "Future months can't be entered yet.",
    path: ["month"],
  })
  .transform(({ year, month, ...values }) => ({ ...values, month: toMonthDate(year, month) }));

export type MonthlyFlowFormValues = z.input<typeof monthlyFlowSchema>;
export type MonthlyFlowValues = z.output<typeof monthlyFlowSchema>;

export const deleteMonthlyFlowSchema = z.object({
  accountId: z.uuid(),
  month: z.iso.date(),
});

export type DeleteMonthlyFlowValues = z.infer<typeof deleteMonthlyFlowSchema>;

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };
