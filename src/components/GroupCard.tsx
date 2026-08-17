import { useDraggable } from "@dnd-kit/core";
import { Clock, GripVertical } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatLastSeen, type WaGroup } from "@/lib/wa-groups";

type Props = {
  group: WaGroup;
  onToggleAtivo: (group: WaGroup, ativo: boolean) => void;
  dragging?: boolean;
};

export function GroupCard({ group, onToggleAtivo, dragging }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: group.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 shadow-sm transition-opacity",
        !group.ativo && "opacity-45",
        (isDragging || dragging) && "opacity-30",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Arrastar grupo"
          className="mt-0.5 cursor-grab touch-none rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-card-foreground">
            {group.group_name?.trim() || "Sem nome"}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={group.chat_id}>
            {group.chat_id}
          </p>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {formatLastSeen(group.last_seen_at)}
          </p>
        </div>
        <label className="flex shrink-0 flex-col items-center gap-1">
          <Switch
            checked={group.ativo}
            onCheckedChange={(checked) => onToggleAtivo(group, checked)}
            aria-label={`Ativo: ${group.group_name ?? group.chat_id}`}
          />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ativo</span>
        </label>
      </div>
    </div>
  );
}
