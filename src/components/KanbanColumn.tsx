import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  id: string;
  label: string;
  hint: string;
  count: number;
  children: ReactNode;
};

export function KanbanColumn({ id, label, hint, count, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-xl border border-border bg-secondary/60 p-3 transition-colors",
        isOver && "border-primary bg-primary/10",
      )}
    >
      <header className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      </header>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}
