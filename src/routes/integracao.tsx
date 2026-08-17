import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Copy, ArrowLeft } from "lucide-react";
import { useState } from "react";

const TITLE = "Integração n8n — Kanban de Grupos";
const DESCRIPTION =
  "URL do projeto, chave pública e endpoint REST para inserir grupos de WhatsApp a partir do n8n.";

export const Route = createFileRoute("/integracao")({
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
  component: IntegracaoPage,
});

function CopyRow({ label, value, help }: { label: string; value: string; help?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{label}</p>
          {help ? <p className="mt-0.5 text-xs text-muted-foreground">{help}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md bg-secondary p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {value}
      </pre>
    </div>
  );
}

function IntegracaoPage() {
  const url = import.meta.env["VITE_SUPABASE_URL"] ?? "";
  const anonKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
  const restEndpoint = `${url}/rest/v1/wa_groups`;
  const exampleBody = `{
  "chat_id": "120363422987854683@g.us",
  "group_name": "Nome do grupo",
  "last_seen_at": "{{ $now.toISO() }}"
}`;
  const upsertCurl = `curl -X POST "${restEndpoint}?on_conflict=chat_id" \\
  -H "apikey: ${anonKey}" \\
  -H "Authorization: Bearer ${anonKey}" \\
  -H "Content-Type: application/json" \\
  -H "Prefer: resolution=merge-duplicates" \\
  -d '${exampleBody.replace(/\n\s*/g, " ")}'`;

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
          <h1 className="text-lg font-bold tracking-tight text-foreground">Integração com n8n</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Use estes valores no nó HTTP Request (ou na credential Supabase) do n8n para inserir e
          atualizar grupos na tabela <code className="font-mono">wa_groups</code>.
        </p>

        <CopyRow label="URL do projeto" value={url} help="Host da API do backend" />
        <CopyRow
          label="Chave pública (anon / publishable)"
          value={anonKey}
          help="Pode ser usada no navegador; só permite ler e atualizar grupos"
        />
        <CopyRow
          label="Endpoint REST da tabela"
          value={`${restEndpoint}?on_conflict=chat_id`}
          help="POST com Prefer: resolution=merge-duplicates faz upsert por chat_id"
        />
        <CopyRow
          label="Corpo JSON de exemplo"
          value={exampleBody}
          help="categoria e ativo usam os valores padrão (indefinido / true)"
        />
        <CopyRow label="Exemplo completo (curl)" value={upsertCurl} help="Para testar rapidamente" />

        <div className="rounded-lg border border-border bg-secondary/60 p-4 text-sm text-foreground">
          <p className="font-semibold">Qual chave usar no n8n</p>
          <p className="mt-1 text-muted-foreground">
            A chave pública acima já é suficiente: ela permite inserir, ler e atualizar grupos em{" "}
            <code className="font-mono">wa_groups</code> (o app é aberto, sem login). Basta enviá-la
            nos headers <code className="font-mono">apikey</code> e{" "}
            <code className="font-mono">Authorization: Bearer</code>. A chave de serviço e a senha do
            banco não ficam disponíveis neste tipo de projeto — e não são necessárias aqui.
          </p>
        </div>

      </div>
    </main>
  );
}
