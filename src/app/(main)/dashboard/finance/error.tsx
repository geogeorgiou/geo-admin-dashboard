"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function FinanceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed text-center"
    >
      <div className="space-y-1">
        <p>Could not load your finances.</p>
        <p className="text-muted-foreground text-xs">{error.message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
