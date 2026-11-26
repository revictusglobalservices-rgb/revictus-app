-- Limit profile writes to trusted server-side operations.
-- Keep existing read access and row-level security unchanged.
revoke insert, update, delete, truncate, references, trigger on table public.utilisateurs from anon, authenticated, public;
