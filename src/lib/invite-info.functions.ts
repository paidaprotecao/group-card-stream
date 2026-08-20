import { createServerFn } from "@tanstack/react-start";

/** Busca na uazapi as informações dos convites que ainda não foram consultados. */
export const buscarInfosPendentes = createServerFn({ method: "POST" }).handler(async () => {
  const { preencherInfosPendentes } = await import("@/lib/invite-info.server");
  return preencherInfosPendentes(30);
});
