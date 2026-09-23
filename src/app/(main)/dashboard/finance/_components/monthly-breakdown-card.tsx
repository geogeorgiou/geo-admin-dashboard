import { cn } from "cn";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { MonthPoint } from "./finance-data";
import { formatEur } from "./format";

export function MonthlyBreakdownCard({ months }: { months: MonthPoint[] }) {
  const rows = [...months].reverse();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Monthly Breakdown</CardTitle>
        <CardDescription>Newest first. Hover a note to read it in full.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Deposits</TableHead>
                <TableHead className="text-right">Withdrawals</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((month) =>
                month.entered ? (
                  <TableRow key={month.month}>
                    <TableCell>
                      <div>{month.label}</div>
                      {month.note && (
                        <div className="max-w-40 truncate text-muted-foreground text-xs" title={month.note}>
                          {month.note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur(month.deposits)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEur(month.withdrawals)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        month.net > 0 && "text-green-700 dark:text-green-300",
                        month.net < 0 && "text-destructive",
                      )}
                    >
                      {formatEur(month.net, { signed: true })}
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={month.month} className="text-muted-foreground">
                    <TableCell>{month.label}</TableCell>
                    <TableCell colSpan={3} className="text-right text-xs italic">
                      Not entered
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
