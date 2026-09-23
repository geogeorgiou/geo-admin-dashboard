import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading finances">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-96 rounded-xl xl:col-span-7" />
        <Skeleton className="h-96 rounded-xl xl:col-span-5" />
      </div>
    </div>
  );
}
