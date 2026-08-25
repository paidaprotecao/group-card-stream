import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Route as RouteIcon, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CATEGORIAS } from "@/lib/wa-groups";
import type { RotaPostagem } from "@/lib/fila";

const ROTAS_KEY = ["rotas-postagem"];

/** Categorias que fazem sentido como origem de um pacote de mensagens. */
const ORIGENS = CATEGORIAS.filter((c) => c.id !== "aberto_postavel");

async function fetchRotas(): Promise<RotaPostagem[]> {
  const { data, error } = await supabase
    .from("rotas_postagem")
    .select("*")
    .order("categoria_origem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RotaPostagem[];
}

export function RotasPostagem() {
  const queryClient = useQueryClient();
  const { data: rotas } = useQuery({ queryKey: ROTAS_KEY, queryFn: fetchRotas });
  const [rascunho, setRascunho] = useState<
    Record<string, { chat: string; nome: string; cabecalho: string }>
  >({});

  useEffect(() => {
    if (!rotas) return;
    setRascunho((prev) => {
      const next = { ...prev };
      for (const rota of rotas) {
        if (!next[rota.categoria_origem]) {
          next[rota.categoria_origem] = {
            chat: rota.destino_chat_id,
            nome: rota.destino_nome ?? "",
            cabecalho: rota.cabecalho ?? "",
          };
        }
      }
      return next;
    });
  }, [rotas]);

  const salvar = useMutation({
    mutationFn: async (input: {
      categoria: string;
      chat: string;
      nome: string;
      cabecalho: string;
      ativo: boolean;
    }) => {
      const { error } = await supabase.from("rotas_postagem").upsert(
        {
          categoria_origem: input.categoria,
          destino_chat_id: input.chat.trim(),
          destino_nome: input.nome.trim() || null,
          cabecalho: input.cabecalho.trim() || null,
          ativo: input.ativo,
        },
        { onConflict: "categoria_origem" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rota salva");
      void queryClient.invalidateQueries({ queryKey: ROTAS_KEY });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha ao salvar rota"),
  });

  const alternarContato = useMutation({
    mutationFn: async (input: { id: string; valor: boolean }) => {
      const { error } = await supabase
        .from("rotas_postagem")
        .update({ enviar_contato: input.valor })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ROTAS_KEY }),
  });

  const alternarAtivo = useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("rotas_postagem")
        .update({ ativo: input.ativo })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ROTAS_KEY }),
  });

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <header className="mb-3 flex items-center gap-2">
        <RouteIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Para onde cada origem é postada</h2>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        Cada pacote sai assim, automaticamente: cabeçalho, as mensagens encaminhadas na ordem e, por
        último, o contato (vCard) de quem enviou. Sem rota ativa, a origem não é postada.
      </p>

      <div className="space-y-3">
        {ORIGENS.map((origem) => {
          const rota = rotas?.find((r) => r.categoria_origem === origem.id);
          const draft = rascunho[origem.id] ?? { chat: "", nome: "", cabecalho: "" };
          return (
            <div
              key={origem.id}
              className="grid gap-2 rounded-lg border border-border/60 bg-background/40 p-3 md:grid-cols-[minmax(0,140px)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto] md:items-center"
            >
              <span className="text-sm font-medium">{origem.label}</span>
              <Input
                value={draft.nome}
                placeholder="Nome do destino"
                onChange={(e) =>
                  setRascunho((p) => ({ ...p, [origem.id]: { ...draft, nome: e.target.value } }))
                }
              />
              <Input
                value={draft.chat}
                placeholder="1203634...@g.us"
                className="font-mono text-xs"
                onChange={(e) =>
                  setRascunho((p) => ({ ...p, [origem.id]: { ...draft, chat: e.target.value } }))
                }
              />
              <Input
                value={draft.cabecalho}
                placeholder="Cabeçalho antes das mensagens"
                onChange={(e) =>
                  setRascunho((p) => ({
                    ...p,
                    [origem.id]: { ...draft, cabecalho: e.target.value },
                  }))
                }
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={rota ? rota.enviar_contato !== false : true}
                  disabled={!rota}
                  onCheckedChange={(v) => rota && alternarContato.mutate({ id: rota.id, valor: v })}
                  aria-label="Enviar contato"
                />
                <span className="text-xs text-muted-foreground">vCard</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rota ? rota.ativo : true}
                  disabled={!rota}
                  onCheckedChange={(ativo) =>
                    rota && alternarAtivo.mutate({ id: rota.id, ativo })
                  }
                  aria-label="Rota ativa"
                />
                <span className="text-xs text-muted-foreground">
                  {rota?.ativo === false ? "inativa" : "ativa"}
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!draft.chat.trim() || salvar.isPending}
                onClick={() =>
                  salvar.mutate({
                    categoria: origem.id,
                    chat: draft.chat,
                    nome: draft.nome,
                    cabecalho: draft.cabecalho,
                    ativo: rota ? rota.ativo : true,
                  })
                }
              >
                <Save className="mr-1 size-3.5" />
                Salvar
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
