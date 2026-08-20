import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Eraser, Plug, RefreshCw, Send, Truck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { syncUazapiGroups } from "@/lib/uazapi.functions";
import { limparChatsAgora } from "@/lib/limpar-chats.functions";

import { GroupCard } from "@/components/GroupCard";
import { KanbanColumn } from "@/components/KanbanColumn";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIAS, isCategoria, sortByLastSeen, type WaGroup } from "@/lib/wa-groups";

const TITLE = "Kanban de Grupos do WhatsApp";
const DESCRIPTION =
  "Classifique, ative e monitore seus grupos de WhatsApp em um Kanban com atualização em tempo real.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KanbanPage,
});

const QUERY_KEY = ["wa_groups"];

async function fetchGroups(): Promise<WaGroup[]> {
  const { data, error } = await supabase
    .from("wa_groups")
    .select("*")
    .order("last_seen_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as WaGroup[];
}

function KanbanPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchGroups,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const syncGroups = useServerFn(syncUazapiGroups);
  const limparChats = useServerFn(limparChatsAgora);

  async function handleLimparChats() {
    setLimpando(true);
    try {
      const result = await limparChats();
      if (!result.ok) {
        toast.error("Falha ao limpar chats", { description: result.error });
        return;
      }
      toast.success("Chats limpos", {
        description: `${result.limpos}/${result.total} grupos ativos · ${result.falhas} falhas`,
      });
    } catch (err) {
      toast.error("Falha ao limpar chats", { description: (err as Error).message });
    } finally {
      setLimpando(false);
    }
  }


  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncGroups();
      if (!result.ok) {
        toast.error("Falha na sincronização", { description: result.error });
        return;
      }
      toast.success("Grupos sincronizados", {
        description: `${result.total} grupos na uazapi · ${result.inserted} novos · ${result.updated} atualizados`,
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      toast.error("Falha na sincronização", { description: (err as Error).message });
    } finally {
      setSyncing(false);
    }
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    const channel = supabase
      .channel("wa_groups_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_groups" }, () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const groups = sortByLastSeen(data ?? []);

  function patchLocal(id: string, patch: Partial<WaGroup>) {
    queryClient.setQueryData<WaGroup[]>(QUERY_KEY, (prev) =>
      (prev ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  }

  async function updateGroup(group: WaGroup, patch: Partial<WaGroup>) {
    const previous = { categoria: group.categoria, ativo: group.ativo };
    patchLocal(group.id, patch);
    const { error: updateError } = await supabase
      .from("wa_groups")
      .update(patch)
      .eq("id", group.id);
    if (updateError) {
      patchLocal(group.id, previous);
      toast.error("Não foi possível salvar", { description: updateError.message });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over?.id;
    if (!overId || typeof overId !== "string" || !isCategoria(overId)) return;
    const group = groups.find((g) => g.id === event.active.id);
    if (!group || group.categoria === overId) return;
    void updateGroup(group, { categoria: overId });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  const activeGroup = groups.find((g) => g.id === activeId) ?? null;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">{TITLE}</h1>
            <p className="text-xs text-muted-foreground">
              Arraste os cards para classificar. Novos grupos aparecem em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              <Download className={syncing ? "size-3.5 animate-pulse" : "size-3.5"} />
              {syncing ? "Buscando..." : "Buscar grupos (uazapi)"}
            </button>
            <button
              type="button"
              onClick={() => void handleLimparChats()}
              disabled={limpando}
              title="Limpa o histórico de mensagens dos grupos ativos (roda automaticamente a cada 15 min)"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              <Eraser className={limpando ? "size-3.5 animate-pulse" : "size-3.5"} />
              {limpando ? "Limpando..." : "Limpar chats"}
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw className={isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </button>
            <Link
              to="/disparo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Send className="size-3.5" />
              Disparo avulso
            </Link>
            <Link
              to="/grupos-caminhao"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Truck className="size-3.5" />
              Grupos de caminhão
            </Link>
            <Link
              to="/integracao"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Plug className="size-3.5" />
              Integração n8n
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            Erro ao carregar os grupos: {(error as Error).message}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {CATEGORIAS.map((cat) => {
                const items = groups.filter((g) =>
                  cat.id === "indefinido" && !isCategoria(g.categoria)
                    ? true
                    : g.categoria === cat.id,
                );
                return (
                  <KanbanColumn
                    key={cat.id}
                    id={cat.id}
                    label={cat.label}
                    hint={cat.hint}
                    count={items.length}
                  >
                    {isLoading ? (
                      <>
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                      </>
                    ) : items.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                        Nenhum grupo aqui
                      </p>
                    ) : (
                      items.map((group) => (
                        <GroupCard
                          key={group.id}
                          group={group}
                          onToggleAtivo={(g, ativo) => void updateGroup(g, { ativo })}
                        />
                      ))
                    )}
                  </KanbanColumn>
                );
              })}
            </div>
            <DragOverlay>
              {activeGroup ? (
                <div className="w-[256px] rotate-1">
                  <GroupCard group={activeGroup} onToggleAtivo={() => {}} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </main>
  );
}
