import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { contarGruposPostaveis, dispararParaAbertoPostavel } from "@/lib/disparo.functions";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TITLE = "Disparo avulso — Grupos Aberto Postável";
const DESCRIPTION =
  "Escreva um post e dispare individualmente para cada grupo de WhatsApp da coluna Aberto postável.";

export const Route = createFileRoute("/disparo")({
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
  component: DisparoPage,
});

const MEDIA_TYPES = [
  "image",
  "video",
  "videoplay",
  "document",
  "audio",
  "myaudio",
  "ptt",
  "ptv",
  "sticker",
] as const;

type Resultado = { chat_id: string; group_name: string | null; ok: boolean; error?: string };

function DisparoPage() {
  const contar = useServerFn(contarGruposPostaveis);
  const disparar = useServerFn(dispararParaAbertoPostavel);

  const { data: contagem } = useQuery({
    queryKey: ["grupos_postaveis_count"],
    queryFn: () => contar(),
  });

  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [mediaType, setMediaType] = useState<(typeof MEDIA_TYPES)[number]>("image");
  const [docName, setDocName] = useState("");
  const [delayMs, setDelayMs] = useState(1500);
  const [sending, setSending] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  async function handleSend() {
    if (!text.trim() && !fileUrl.trim()) {
      toast.error("Escreva um texto ou informe a URL de uma mídia");
      return;
    }
    setSending(true);
    setResultados([]);
    try {
      const res = await disparar({
        data: {
          text,
          fileUrl: fileUrl.trim() || null,
          mediaType: fileUrl.trim() ? mediaType : null,
          docName: docName.trim() || null,
          delayMs,
        },
      });
      if (!res.ok) {
        toast.error("Disparo não realizado", { description: res.error });
        return;
      }
      setResultados(res.resultados);
      if (res.falhas === 0) {
        toast.success("Disparo concluído", { description: `${res.enviados} grupos receberam o post` });
      } else {
        toast.warning("Disparo concluído com falhas", {
          description: `${res.enviados} enviados · ${res.falhas} falharam`,
        });
      }
    } catch (err) {
      toast.error("Falha no disparo", { description: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  const total = contagem?.count ?? 0;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-3.5" />
            Kanban
          </Link>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Disparo avulso</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="rounded-lg border border-border bg-secondary/60 p-4 text-sm text-foreground">
          O post será enviado <strong>individualmente</strong> para cada grupo ativo da coluna{" "}
          <strong>Aberto postável</strong>. Atualmente:{" "}
          <strong>{total} grupo{total === 1 ? "" : "s"}</strong>.
        </div>

        <div className="space-y-2">
          <Label htmlFor="texto">Mensagem</Label>
          <Textarea
            id="texto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Escreva o que quer postar nos grupos..."
          />
          <p className="text-xs text-muted-foreground">
            Sem mídia, o texto é enviado como mensagem. Com mídia, ele vira a legenda.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="file">Mídia (URL ou base64) — opcional</Label>
            <Input
              id="file"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://exemplo.com/foto.jpg"
            />
          </div>

          {fileUrl.trim() ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de mídia</Label>
                <select
                  id="tipo"
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as (typeof MEDIA_TYPES)[number])}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {MEDIA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {mediaType === "document" ? (
                <div className="space-y-2">
                  <Label htmlFor="docname">Nome do arquivo</Label>
                  <Input
                    id="docname"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="tabela.pdf"
                  />
                </div>
              ) : null}
            </>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="delay">Intervalo entre envios (ms)</Label>
            <Input
              id="delay"
              type="number"
              min={0}
              max={20000}
              step={500}
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Recomendado 1500 ms ou mais para reduzir risco de bloqueio.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || total === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Send className={sending ? "size-4 animate-pulse" : "size-4"} />
          {sending ? "Disparando..." : `Disparar para ${total} grupo${total === 1 ? "" : "s"}`}
        </button>

        {resultados.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Resultado por grupo</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {resultados.map((r) => (
                <li key={r.chat_id} className="flex items-start gap-2 px-3 py-2 text-sm">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-card-foreground">{r.group_name ?? "Sem nome"}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {r.chat_id}
                      {r.error ? ` — ${r.error}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
