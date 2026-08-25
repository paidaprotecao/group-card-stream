import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ListOrdered, Play, RefreshCw, RotateCcw, X, Zap } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  JANELA_SEGUNDOS,
  STATUS_LABEL,
  tipoLabel,
  type FilaItem,
  type FilaLote,
} from "@/lib/fila";
import {
  cancelarLote,
  liberarLote,
  processarFilaAgora,
  reenviarLote,
} from "@/lib/fila.functions";

const TITLE = "Fila de postagem dos grupos";
const DESCRIPTION =
  "Pacotes de mensagens capturados dos grupos de frete, agrupados por remetente e encaminhados em ordem para os grupos postáveis.";

export const Route = createFileRoute("/fila")({
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
  component: FilaPage,
});

const QUERY_KEY = ["fila"];

type LoteComItens = FilaLote & { itens: FilaItem[] };

async function fetchFila(): Promise<LoteComItens[]> {
  const { data: lotes, error } = await supabase
    .from("fila_lotes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;

  const ids = (lotes ?? []).map((l) => l.id);
  let itens: FilaItem[] = [];
  if (ids.length > 0) {
    const { data, error: itemErr } = await supabase
      .from("fila_itens")
      .select("*")
      .in("lote_id", ids)
      .order("ordem", { ascending: true });
    if (itemErr) throw itemErr;
    itens = (data ?? []) as FilaItem[];
  }

  return ((lotes ?? []) as FilaLote[]).map((l) => ({
    ...l,
    itens: itens.filter((i) => i.lote_id === l.id),
  }));
}

function contagem(fecha: string): string {
  const diff = Date.parse(fecha) - Date.now();
  if (diff <= 0) return "janela fechada";
  return `fecha em ${Math.ceil(diff / 1000)}s`;
}

function FilaPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchFila,
    refetchInterval: 5000,
  });
  const [rodando, setRodando] = useState(false);
  const processar = useServerFn(processarFilaAgora);
  const liberar = useServerFn(liberarLote);
  const cancelar = useServerFn(cancelarLote);
  const reenviar = useServerFn(reenviarLote);

  useEffect(() => {
    const channel = supabase
      .channel("fila_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "fila_lotes" }, () => {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fila_itens" }, () => {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function handleProcessar() {
    setRodando(true);
    try {
      const result = await processar();
      if (!result.ok) {
        toast.error("Falha ao processar a fila", { description: result.error });
        return;
      }
      toast.success("Fila processada", {
        description:
          result.processados > 0
            ? `${result.processados} pacote(s) enviado(s)`
            : (result.motivo ?? "nada pendente"),
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      toast.error("Falha ao processar a fila", { description: (err as Error).message });
    } finally {
      setRodando(false);
    }
  }

  async function acao(fn: (arg: { data: { id: string } }) => Promise<unknown>, id: string, msg: string) {
    try {
      await fn({ data: { id } });
      toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      toast.error("Não foi possível concluir", { description: (err as Error).message });
    }
  }

  const lotes = data ?? [];
  const pendentes = lotes.filter((l) => l.status === "aguardando" || l.status === "pronto").length;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ArrowLeft className="size-3.5" />
              Kanban
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
                <ListOrdered className="size-4 text-primary" />
                {TITLE}
              </h1>
              <p className="text-xs text-muted-foreground">
                Mensagens do mesmo remetente são juntadas por {JANELA_SEGUNDOS}s e encaminhadas na
                ordem, um pacote por vez. {pendentes} pendente(s).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw className={isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void handleProcessar()}
              disabled={rodando}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Play className={rodando ? "size-3.5 animate-pulse" : "size-3.5"} />
              {rodando ? "Processando..." : "Processar agora"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] space-y-3 px-4 py-6">
        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            Erro ao carregar a fila: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : lotes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
            Nada na fila ainda. Aponte o webhook do n8n para{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/public/hooks/frete</code>.
          </p>
        ) : (
          lotes.map((lote) => {
            const st = STATUS_LABEL[lote.status] ?? STATUS_LABEL["pronto"]!;
            return (
              <article
                key={lote.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.tone}`}
                      >
                        {st.label}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {lote.sender ?? "remetente desconhecido"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {lote.itens_count} item(ns)
                        {lote.status === "aguardando" ? ` · ${contagem(lote.fecha_em)}` : ""}
                        {lote.status === "enviado" || lote.status === "erro"
                          ? ` · ${lote.enviados} envios · ${lote.falhas} falhas`
                          : ""}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Origem: {lote.source_group_name ?? lote.source_chat_id ?? "não informada"}
                    </p>
                    {lote.erro ? (
                      <p className="mt-1 text-xs text-destructive">{lote.erro}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {lote.status === "aguardando" ? (
                      <button
                        type="button"
                        onClick={() => void acao(liberar, lote.id, "Pacote liberado para a fila")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        <Zap className="size-3.5" />
                        Fechar agora
                      </button>
                    ) : null}
                    {lote.status === "enviado" || lote.status === "erro" ? (
                      <button
                        type="button"
                        onClick={() => void acao(reenviar, lote.id, "Pacote recolocado na fila")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        <RotateCcw className="size-3.5" />
                        Reenviar
                      </button>
                    ) : null}
                    {lote.status !== "enviando" && lote.status !== "cancelado" ? (
                      <button
                        type="button"
                        onClick={() => void acao(cancelar, lote.id, "Pacote cancelado")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                      >
                        <X className="size-3.5" />
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>

                <ol className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {lote.itens.map((item, idx) => (
                    <li key={item.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {idx + 1} · {tipoLabel(item.tipo)}
                      </span>
                      <span className="min-w-0 flex-1 text-foreground">
                        {item.text ? (
                          <span className="line-clamp-3 whitespace-pre-wrap">{item.text}</span>
                        ) : (
                          <span className="text-muted-foreground">sem legenda</span>
                        )}
                        {item.media_url ? (
                          <a
                            href={item.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 text-primary underline underline-offset-2"
                          >
                            mídia
                          </a>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
