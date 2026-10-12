import { formatCurrency } from "@/lib/utils";

export function formatEur(amount: number, opts?: { signed?: boolean; noDecimals?: boolean }) {
  const formatted = formatCurrency(amount, { currency: "EUR", locale: "en-IE", noDecimals: opts?.noDecimals });
  return opts?.signed && amount > 0 ? `+${formatted}` : formatted;
}
