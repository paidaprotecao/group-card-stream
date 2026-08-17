CREATE TABLE public.wa_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text UNIQUE NOT NULL,
  group_name text,
  categoria text NOT NULL DEFAULT 'indefinido',
  ativo boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX wa_groups_last_seen_idx ON public.wa_groups (last_seen_at DESC NULLS LAST);

GRANT SELECT, UPDATE ON public.wa_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_groups TO authenticated;
GRANT ALL ON public.wa_groups TO service_role;

ALTER TABLE public.wa_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_groups public read" ON public.wa_groups FOR SELECT USING (true);
CREATE POLICY "wa_groups public update" ON public.wa_groups FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "wa_groups authenticated insert" ON public.wa_groups FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE public.wa_groups REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_groups;

INSERT INTO public.wa_groups (chat_id, group_name, categoria, ativo, last_seen_at) VALUES
  ('120363422987854683@g.us', 'Fretes SP - Capital', 'frete_fechado', true, now() - interval '5 minutes'),
  ('120363111111111111@g.us', 'Cargas Sul / Retorno', 'frete_fechado', true, now() - interval '2 hours'),
  ('120363222222222222@g.us', 'Venda de Caminhões BR', 'venda_fechado', true, now() - interval '35 minutes'),
  ('120363333333333333@g.us', 'Implementos Usados', 'venda_fechado', false, now() - interval '3 days'),
  ('120363444444444444@g.us', 'Fretes Livres 24h', 'aberto_postavel', true, now() - interval '1 minute'),
  ('120363555555555555@g.us', 'Rede Transporte Aberto', 'aberto_postavel', true, now() - interval '8 hours'),
  ('120363666666666666@g.us', 'Avisos Transportadora', 'aberto_bloqueado', true, now() - interval '1 day'),
  ('120363777777777777@g.us', NULL, 'indefinido', true, now() - interval '10 minutes'),
  ('120363888888888888@g.us', 'Grupo novo sem classificação', 'indefinido', true, now() - interval '45 minutes');