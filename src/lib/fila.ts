export type LoteStatus = "aguardando" | "pronto" | "enviando" | "enviado" | "erro";

export type FilaLote = {
  id: string;
  sender: string | null;
  source_chat_id: string | null;
  source_group_name: string | null;
  status: string;
  fecha_em: string;
  itens_count: number;
  enviados: number;
  falhas: number;
  erro: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FilaItem = {
  id: string;
  lote_id: string;
  ordem: number;
  tipo: string;
  text: string | null;
  media_url: string | null;
  doc_name: string | null;
  external_id: string | null;
  created_at: string;
};

/** Segundos de espera após a última mensagem antes de considerar o pacote completo. */
export const JANELA_SEGUNDOS = 45;
/** Intervalo entre envios para cada grupo (ms). */
export const DELAY_ENTRE_GRUPOS = 1500;
/** Intervalo entre itens do mesmo pacote (ms). */
export const DELAY_ENTRE_ITENS = 900;

export const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  aguardando: { label: "Aguardando pacote", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  pronto: { label: "Na fila", tone: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  enviando: { label: "Enviando", tone: "bg-primary/15 text-primary border-primary/30" },
  enviado: { label: "Enviado", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  erro: { label: "Erro", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelado: { label: "Cancelado", tone: "bg-muted text-muted-foreground border-border" },
};

export function tipoLabel(tipo: string): string {
  switch (tipo) {
    case "image":
      return "Imagem";
    case "video":
      return "Vídeo";
    case "audio":
      return "Áudio";
    case "document":
      return "Documento";
    default:
      return "Texto";
  }
}
