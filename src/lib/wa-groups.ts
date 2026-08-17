export type Categoria =
  | "indefinido"
  | "frete_fechado"
  | "venda_fechado"
  | "aberto_postavel"
  | "aberto_bloqueado";

export type WaGroup = {
  id: string;
  chat_id: string;
  group_name: string | null;
  categoria: string;
  ativo: boolean;
  last_seen_at: string | null;
  created_at: string | null;
};

export const CATEGORIAS: { id: Categoria; label: string; hint: string }[] = [
  { id: "indefinido", label: "Indefinido", hint: "Novos grupos caem aqui" },
  { id: "frete_fechado", label: "Frete (fechado)", hint: "Grupo fechado de frete" },
  { id: "venda_fechado", label: "Venda (fechado)", hint: "Grupo fechado de venda" },
  { id: "aberto_postavel", label: "Aberto postável", hint: "Pode postar livremente" },
  { id: "aberto_bloqueado", label: "Aberto bloqueado", hint: "Aberto, mas sem postar" },
];

export function isCategoria(value: string): value is Categoria {
  return CATEGORIAS.some((c) => c.id === value);
}

export function sortByLastSeen(groups: WaGroup[]): WaGroup[] {
  return [...groups].sort((a, b) => {
    const ta = a.last_seen_at ? Date.parse(a.last_seen_at) : -Infinity;
    const tb = b.last_seen_at ? Date.parse(b.last_seen_at) : -Infinity;
    return tb - ta;
  });
}

export function formatLastSeen(value: string | null): string {
  if (!value) return "sem registro";
  const diff = Date.now() - Date.parse(value);
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}
