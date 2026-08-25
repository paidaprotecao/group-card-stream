CREATE TABLE public.rotas_postagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_origem text NOT NULL UNIQUE,
  destino_chat_id text NOT NULL,
  destino_nome text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotas_postagem TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotas_postagem TO anon;
GRANT ALL ON public.rotas_postagem TO service_role;

ALTER TABLE public.rotas_postagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_select_rotas_postagem ON public.rotas_postagem FOR SELECT USING (true);
CREATE POLICY public_insert_rotas_postagem ON public.rotas_postagem FOR INSERT WITH CHECK (true);
CREATE POLICY public_update_rotas_postagem ON public.rotas_postagem FOR UPDATE USING (true);
CREATE POLICY public_delete_rotas_postagem ON public.rotas_postagem FOR DELETE USING (true);

CREATE TRIGGER update_rotas_postagem_updated_at BEFORE UPDATE ON public.rotas_postagem
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.rotas_postagem (categoria_origem, destino_chat_id, destino_nome) VALUES
  ('frete_fechado', '120363409506204671@g.us', 'Fretes br'),
  ('venda_fechado', '120363429220990889@g.us', 'brutos classificados');

ALTER TABLE public.fila_lotes ADD COLUMN categoria_origem text;