import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, ExternalLink, Info, RefreshCw, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { buscarInfosPendentes } from "@/lib/invite-info.functions";

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
  group_jid: string | null;
  group_description: string | null;
  group_owner: string | null;
  participants_count: number | null;
  info_fetched_at: string | null;
  info_error: string | null;
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
const MEUS_KEY = ["wa_groups_chat_ids"];

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

async function fetchMeusChatIds(): Promise<string[]> {
  const { data, error } = await supabase.from("wa_groups").select("chat_id");
  if (error) throw error;
  return (data ?? []).map((r) => r.chat_id);
}

function GruposCaminhaoPage() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<string>("novo");
  const [buscando, setBuscando] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const buscarInfos = useServerFn(buscarInfosPendentes);

  async function handleBuscarInfos() {
    setBuscando(true);
    try {
      const r = await buscarInfos({});
      if (r.total === 0) toast.info("Nenhum convite pendente de consulta");
      else
        toast.success(`${r.ok} de ${r.total} grupos consultados`, {
          description: r.falhas > 0 ? `${r.falhas} convites não retornaram dados` : undefined,
        });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      toast.error("Falha ao consultar", { description: (err as Error).message });
    } finally {
      setBuscando(false);
    }
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchLinks,
  });
  const { data: meusChatIds } = useQuery({ queryKey: MEUS_KEY, queryFn: fetchMeusChatIds });

  const meus = useMemo(() => new Set(meusChatIds ?? []), [meusChatIds]);

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
  const visibleIds = visible.map((r) => r.id);
  const selecionadosVisiveis = selecionados.filter((id) => visibleIds.includes(id));
  const todosSelecionados = visible.length > 0 && selecionadosVisiveis.length === visible.length;
  const selectedRows = visible.filter((r) => selecionados.includes(r.id));

  function toggleRow(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleTodos() {
    setSelecionados(todosSelecionados ? [] : visibleIds);
  }

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

  async function copy(text: string, label = "Link copiado") {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  }

  async function copiarSelecionados() {
    if (selectedRows.length === 0) return;
    await copy(
      selectedRows.map((r) => r.invite_url).join("\n"),
      `${selectedRows.length} link(s) copiado(s)`,
    );
  }

  function abrirSelecionados() {
    if (selectedRows.length === 0) return;
    for (const r of selectedRows) window.open(r.invite_url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-center justify-between gap-3 px-4 py-4">
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
            <button
              type="button"
              onClick={() => void handleBuscarInfos()}
              disabled={buscando}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              <Info className={buscando ? "size-3.5 animate-pulse" : "size-3.5"} />
              Buscar infos
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

      <div className="mx-auto max-w-[1300px] space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS.map((s) => {
            const count = rows.filter((r) => r.status === s.id).length;
            const active = filtro === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setFiltro(s.id);
                  setSelecionados([]);
                }}
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

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          <span className="text-xs text-muted-foreground">
            {selectedRows.length} selecionado(s)
          </span>
          <button
            type="button"
            onClick={() => void copiarSelecionados()}
            disabled={selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Copy className="size-3.5" />
            Copiar links
          </button>
          <button
            type="button"
            onClick={abrirSelecionados}
            disabled={selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <ExternalLink className="size-3.5" />
            Acessar links
          </button>
          <button
            type="button"
            onClick={() => void Promise.all(selectedRows.map((r) => setStatus(r, "entrei")))}
            disabled={selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Check className="size-3.5" />
            Marcar entrei
          </button>
          <button
            type="button"
            onClick={() => void Promise.all(selectedRows.map((r) => setStatus(r, "ignorado")))}
            disabled={selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <X className="size-3.5" />
            Ignorar
          </button>
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
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={todosSelecionados}
                      onChange={toggleTodos}
                      className="size-3.5 accent-primary"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Nome do grupo</th>
                  <th className="px-3 py-2 font-medium">ID do grupo</th>
                  <th className="px-3 py-2 font-medium">Pessoas</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Link</th>
                  <th className="px-3 py-2 font-medium">Já estou?</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const jaEstou = row.group_jid ? meus.has(row.group_jid) : false;
                  return (
                    <tr key={row.id} className="border-b border-border/60 last:border-0 align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${row.group_name ?? row.invite_code}`}
                          checked={selecionados.includes(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="size-3.5 accent-primary"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">
                          {row.group_name ?? "—"}
                        </span>
                        {row.hits > 1 ? (
                          <span className="ml-1 text-muted-foreground">· visto {row.hits}x</span>
                        ) : null}
                        {row.info_error ? (
                          <span className="block text-destructive">{row.info_error}</span>
                        ) : null}
                      </td>
                      <td className="max-w-[210px] truncate px-3 py-2 font-mono text-muted-foreground">
                        {row.group_jid ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        {row.participants_count ?? "—"}
                      </td>
                      <td className="max-w-[280px] px-3 py-2 text-muted-foreground">
                        <span className="line-clamp-2">{row.group_description ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="max-w-[190px] truncate font-mono text-muted-foreground">
                            {row.invite_url}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copy(row.invite_url)}
                            title="Copiar link"
                            className="rounded-md border border-input p-1 text-foreground hover:bg-accent"
                          >
                            <Copy className="size-3" />
                          </button>
                          <a
                            href={row.invite_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Abrir convite"
                            className="rounded-md border border-input p-1 text-foreground hover:bg-accent"
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {jaEstou ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                            <Check className="size-3" />
                            Já estou
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.group_jid ? "Não" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <section className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Como ligar o n8n</h2>
          <p>No fim do seu fluxo que escuta as mensagens, adicione um nó HTTP Request:</p>
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
