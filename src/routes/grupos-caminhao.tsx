import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, ExternalLink, RefreshCw, Trash2, X } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

const TITLE = "Banco de Grupos de Caminhão";
const DESCRIPTION =
  "Links de grupos de WhatsApp capturados automaticamente das mensagens recebidas pelo webhook.";

export const Route = createFileRoute("/grupos-caminhao")({
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
  component: GruposCaminhaoPage,
});

type LinkRow = {
  id: string;
  invite_code: string;
  invite_url: string;
  group_name: string | null;
  status: string;
  source_chat_id: string | null;
  source_group_name: string | null;
  sender: string | null;
  message_text: string | null;
  hits: number;
  last_seen_at: string;
  created_at: string;
};

const QUERY_KEY = ["grupos_caminhao"];

const STATUS = [
  { id: "novo", label: "Novos" },
  { id: "entrei", label: "Entrei" },
  { id: "ignorado", label: "Ignorados" },
] as const;

async function fetchLinks(): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from("grupos_caminhao")
    .select("*")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LinkRow[];
}

function GruposCaminhaoPage() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<string>("novo");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLinks,
  });

  useEffect(() => {
    const channel = supabase
      .channel("grupos_caminhao_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "grupos_caminhao" }, () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = data ?? [];
  const visible = rows.filter((r) => r.status === filtro);

  async function setStatus(row: LinkRow, status: string) {
    const { error: updateError } = await supabase
      .from("grupos_caminhao")
      .update({ status })
      .eq("id", row.id);
    if (updateError) {
      toast.error("Não foi possível salvar", { description: updateError.message });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function remove(row: LinkRow) {
    const { error: delError } = await supabase.from("grupos_caminhao").delete().eq("id", row.id);
    if (delError) {
      toast.error("Não foi possível remover", { description: delError.message });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Link copiado");
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">{TITLE}</h1>
            <p className="text-xs text-muted-foreground">
              Todo link de grupo que chegar nas mensagens é salvo aqui automaticamente.
            </p>
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
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <ArrowLeft className="size-3.5" />
              Kanban
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1000px] space-y-4 px-4 py-6">
        <div className="flex gap-2">
          {STATUS.map((s) => {
            const count = rows.filter((r) => r.status === s.id).length;
            const active = filtro === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setFiltro(s.id)}
                className={
                  active
                    ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    : "rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                }
              >
                {s.label} ({count})
              </button>
            );
          })}
        </div>

        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            Erro ao carregar: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum link nesta aba ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((row) => (
              <li key={row.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-mono text-xs text-foreground">{row.invite_url}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.source_group_name ?? row.source_chat_id ?? "origem desconhecida"}
                      {row.sender ? ` · ${row.sender}` : ""}
                      {row.hits > 1 ? ` · visto ${row.hits}x` : ""}
                    </p>
                    {row.message_text ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground/80">
                        {row.message_text}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copy(row.invite_url)}
                      title="Copiar link"
                      className="rounded-md border border-input p-2 text-foreground hover:bg-accent"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <a
                      href={row.invite_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="Abrir convite"
                      className="rounded-md border border-input p-2 text-foreground hover:bg-accent"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                    {row.status !== "entrei" ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(row, "entrei")}
                        title="Marcar como entrei"
                        className="rounded-md border border-input p-2 text-foreground hover:bg-accent"
                      >
                        <Check className="size-3.5" />
                      </button>
                    ) : null}
                    {row.status !== "ignorado" ? (
                      <button
                        type="button"
                        onClick={() => void setStatus(row, "ignorado")}
                        title="Ignorar"
                        className="rounded-md border border-input p-2 text-foreground hover:bg-accent"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void remove(row)}
                      title="Remover"
                      className="rounded-md border border-input p-2 text-destructive hover:bg-accent"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <section className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Como ligar o n8n</h2>
          <p>
            No fim do seu fluxo que escuta as mensagens, adicione um nó HTTP Request:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] text-foreground">
{`POST https://group-card-stream.lovable.app/api/public/hooks/mensagem
Headers:
  apikey: <chave pública do projeto (ver página Integração n8n)>
  Content-Type: application/json
Body: o próprio JSON da mensagem recebida (qualquer formato)`}
          </pre>
          <p className="mt-2">
            Pode mandar o payload inteiro — eu procuro links <span className="font-mono">chat.whatsapp.com</span> em
            qualquer campo, ignoro repetidos e guardo origem, remetente e texto.
          </p>
        </section>
      </div>
    </main>
  );
}
