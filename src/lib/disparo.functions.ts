import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  text: z.string().max(4000),
  fileUrl: z.string().max(2000).nullable().optional(),
  mediaType: z
    .enum(["image", "video", "videoplay", "document", "audio", "myaudio", "ptt", "ptv", "sticker"])
    .nullable()
    .optional(),
  docName: z.string().max(200).nullable().optional(),
  delayMs: z.number().int().min(0).max(20000).nullable().optional(),
});

export const dispararParaAbertoPostavel = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    if (!data.text.trim() && !data.fileUrl?.trim()) {
      return { ok: false as const, error: "Informe um texto ou uma mídia", resultados: [] };
    }
    const { enviarParaGrupos } = await import("./disparo.server");
    return enviarParaGrupos(data);
  });

export const contarGruposPostaveis = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("wa_groups")
    .select("id", { count: "exact", head: true })
    .eq("categoria", "aberto_postavel")
    .eq("ativo", true);
  if (error) return { count: 0 };
  return { count: count ?? 0 };
});
