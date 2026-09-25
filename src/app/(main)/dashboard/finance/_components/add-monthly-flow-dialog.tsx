"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, TriangleAlert } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { saveMonthlyFlow } from "./actions";
import type { AccountOption, FlowEntry } from "./finance-data";
import {
  isFutureMonth,
  MONTH_NAMES,
  type MonthlyFlowFormValues,
  type MonthlyFlowValues,
  monthlyFlowSchema,
  toMonthDate,
} from "./monthly-flow-schema";

type AddMonthlyFlowDialogProps = {
  accounts: AccountOption[];
  defaultAccountId: string;
  firstYear: number;
};

export function AddMonthlyFlowDialog({ accounts, defaultAccountId, firstYear }: AddMonthlyFlowDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          Add month
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add monthly flow</DialogTitle>
          <DialogDescription>Record one month of deposits and withdrawals for an account.</DialogDescription>
        </DialogHeader>
        {/* Content unmounts on close, so the form starts fresh on every open. */}
        <MonthlyFlowForm
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          firstYear={firstYear}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function findEntry(accounts: AccountOption[], accountId: string, year: string, month: string) {
  const monthDate = toMonthDate(year, month);
  return accounts.find((account) => account.id === accountId)?.entries.find((entry) => entry.month === monthDate);
}

function amountFields(entry: FlowEntry | undefined) {
  return {
    deposits: entry ? String(entry.deposits) : "",
    withdrawals: entry ? String(entry.withdrawals) : "",
    closingBalance: entry?.closingBalance == null ? "" : String(entry.closingBalance),
    note: entry?.note ?? "",
  };
}

// The month after the latest entry, capped at the current month.
function defaultMonth(account: AccountOption | undefined, now: Date) {
  const latest = account?.entries[account.entries.length - 1];
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  if (!latest) return current;

  const next = new Date(`${latest.month}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const candidate = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
  return isFutureMonth(toMonthDate(candidate.year, candidate.month), now) ? current : candidate;
}

type MonthlyFlowFormProps = AddMonthlyFlowDialogProps & { onSaved: () => void };

function MonthlyFlowForm({ accounts, defaultAccountId, firstYear, onSaved }: MonthlyFlowFormProps) {
  const [now] = useState(() => new Date());
  const defaultAccount = accounts.find((account) => account.id === defaultAccountId) ?? accounts[0];
  const [bank, setBank] = useState(defaultAccount?.institution ?? "");

  const banks = [...new Set(accounts.map((account) => account.institution))];
  const bankAccounts = accounts.filter((account) => account.institution === bank);
  const years = Array.from({ length: now.getFullYear() - firstYear + 1 }, (_, index) =>
    String(now.getFullYear() - index),
  );

  const [initial] = useState(() => {
    const { year, month } = defaultMonth(defaultAccount, now);
    const values = { accountId: defaultAccount?.id ?? "", year: String(year), month: String(month) };
    return { ...values, ...amountFields(findEntry(accounts, values.accountId, values.year, values.month)) };
  });

  const form = useForm<MonthlyFlowFormValues, unknown, MonthlyFlowValues>({
    resolver: zodResolver(monthlyFlowSchema),
    defaultValues: initial,
  });

  const [accountId, year, month] = useWatch({ control: form.control, name: ["accountId", "year", "month"] });
  const existing = findEntry(accounts, accountId, year, month);
  const [prefilled, setPrefilled] = useState(existing !== undefined);

  // Prefill from an existing entry, and clear again when moving off one. Typed values survive otherwise.
  function syncTarget(target: Pick<MonthlyFlowFormValues, "accountId" | "year" | "month">) {
    const entry = findEntry(accounts, target.accountId, target.year, target.month);
    if (entry || prefilled) {
      for (const [name, value] of Object.entries(amountFields(entry))) {
        form.setValue(name as keyof ReturnType<typeof amountFields>, value, { shouldValidate: false });
      }
      form.clearErrors(["deposits", "withdrawals", "closingBalance", "note"]);
    }
    setPrefilled(entry !== undefined);
  }

  function changeTarget(name: "accountId" | "year" | "month", value: string) {
    form.setValue(name, value, { shouldValidate: form.formState.isSubmitted });
    syncTarget({ accountId, year, month, [name]: value });
  }

  function changeBank(value: string) {
    setBank(value);
    const first = accounts.find((account) => account.institution === value);
    if (first) changeTarget("accountId", first.id);
  }

  async function onSubmit() {
    // The action re-validates, so send the raw form values.
    const result = await saveMonthlyFlow(form.getValues());
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    onSaved();
  }

  const existingLabel = `${MONTH_NAMES[Number(month) - 1]} ${year}`;
  const isSubmitting = form.formState.isSubmitting;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="flow-bank">Bank</FieldLabel>
            <Select value={bank} onValueChange={changeBank}>
              <SelectTrigger id="flow-bank" className="w-full">
                <SelectValue placeholder="Select a bank" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {banks.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Controller
            control={form.control}
            name="accountId"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="flow-account">Account</FieldLabel>
                <Select value={field.value} onValueChange={(value) => changeTarget("accountId", value)}>
                  <SelectTrigger
                    id="flow-account"
                    className="w-full"
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="month"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="flow-month">Month</FieldLabel>
                <Select value={field.value} onValueChange={(value) => changeTarget("month", value)}>
                  <SelectTrigger
                    id="flow-month"
                    className="w-full"
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Select a month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MONTH_NAMES.map((name, index) => (
                        <SelectItem
                          key={name}
                          value={String(index + 1)}
                          disabled={isFutureMonth(toMonthDate(year, index + 1), now)}
                        >
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="year"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="flow-year">Year</FieldLabel>
                <Select value={field.value} onValueChange={(value) => changeTarget("year", value)}>
                  <SelectTrigger
                    id="flow-year"
                    className="w-full"
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Select a year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {years.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        {existing && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-700 text-xs dark:text-amber-300"
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>
              {existingLabel} already has an entry. Its values are loaded below and saving will overwrite them.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="deposits"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="flow-deposits">Deposits (€)</FieldLabel>
                <Input
                  {...field}
                  id="flow-deposits"
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="withdrawals"
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="flow-withdrawals">Withdrawals (€)</FieldLabel>
                <Input
                  {...field}
                  id="flow-withdrawals"
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <Controller
          control={form.control}
          name="closingBalance"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="flow-closing-balance">Closing balance (€, optional)</FieldLabel>
              <Input
                {...field}
                id="flow-closing-balance"
                inputMode="decimal"
                placeholder="Month-end balance from the statement"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription className="text-xs">Unlocks the net worth figure.</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="note"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="flow-note">Note (optional)</FieldLabel>
              <Textarea {...field} id="flow-note" maxLength={500} rows={2} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting || accounts.length === 0}>
          {isSubmitting ? "Saving…" : existing ? "Overwrite" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
