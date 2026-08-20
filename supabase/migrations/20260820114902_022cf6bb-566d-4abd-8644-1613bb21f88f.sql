ALTER TABLE public.grupos_caminhao
  ADD COLUMN IF NOT EXISTS group_jid text,
  ADD COLUMN IF NOT EXISTS group_description text,
  ADD COLUMN IF NOT EXISTS group_owner text,
  ADD COLUMN IF NOT EXISTS participants_count integer,
  ADD COLUMN IF NOT EXISTS info_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS info_error text;