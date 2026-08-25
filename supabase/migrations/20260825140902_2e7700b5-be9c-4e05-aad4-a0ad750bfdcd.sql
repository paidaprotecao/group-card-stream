CREATE TABLE public.fila_lotes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender text,
  source_chat_id text,
  source_group_name text,
  status text NOT NULL DEFAULT 'aguardando',
  fecha_em timestamp with time zone NOT NULL DEFAULT (now() + interval '45 seconds'),
  itens_count integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  erro text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila_lotes TO anon;
GRANT ALL ON public.fila_lotes TO service_role;

ALTER TABLE public.fila_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_select_fila_lotes" ON public.fila_lotes FOR SELECT USING (true);
CREATE POLICY "public_insert_fila_lotes" ON public.fila_lotes FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_fila_lotes" ON public.fila_lotes FOR UPDATE USING (true);
CREATE POLICY "public_delete_fila_lotes" ON public.fila_lotes FOR DELETE USING (true);

CREATE TABLE public.fila_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lote_id uuid NOT NULL REFERENCES public.fila_lotes(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT 'text',
  text text,
  media_url text,
  doc_name text,
  external_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila_itens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila_itens TO anon;
GRANT ALL ON public.fila_itens TO service_role;

ALTER TABLE public.fila_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_select_fila_itens" ON public.fila_itens FOR SELECT USING (true);
CREATE POLICY "public_insert_fila_itens" ON public.fila_itens FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_fila_itens" ON public.fila_itens FOR UPDATE USING (true);
CREATE POLICY "public_delete_fila_itens" ON public.fila_itens FOR DELETE USING (true);

CREATE INDEX fila_lotes_status_fecha_em_idx ON public.fila_lotes (status, fecha_em);
CREATE INDEX fila_itens_lote_idx ON public.fila_itens (lote_id, ordem);
CREATE UNIQUE INDEX fila_itens_external_id_uniq ON public.fila_itens (external_id) WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_fila_lotes_updated_at BEFORE UPDATE ON public.fila_lotes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fila_itens_updated_at BEFORE UPDATE ON public.fila_itens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fila_lotes REPLICA IDENTITY FULL;
ALTER TABLE public.fila_itens REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_lotes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_itens;