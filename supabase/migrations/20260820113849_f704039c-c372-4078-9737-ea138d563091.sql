CREATE TABLE public.grupos_caminhao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  invite_url TEXT NOT NULL,
  group_name TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  source_chat_id TEXT,
  source_group_name TEXT,
  sender TEXT,
  message_text TEXT,
  hits INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_caminhao TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_caminhao TO authenticated;
GRANT ALL ON public.grupos_caminhao TO service_role;

ALTER TABLE public.grupos_caminhao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_select_grupos_caminhao" ON public.grupos_caminhao FOR SELECT USING (true);
CREATE POLICY "public_insert_grupos_caminhao" ON public.grupos_caminhao FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_grupos_caminhao" ON public.grupos_caminhao FOR UPDATE USING (true);
CREATE POLICY "public_delete_grupos_caminhao" ON public.grupos_caminhao FOR DELETE USING (true);

ALTER TABLE public.grupos_caminhao REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.grupos_caminhao;