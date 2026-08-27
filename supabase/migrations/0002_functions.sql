-- Fonctions utilitaires pour les politiques RLS.
-- `security definer` + `search_path` fixe : nécessaire pour éviter la récursion RLS
-- quand une fonction interroge une table qui a elle-même des politiques actives.

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs u
    where u.id = auth.uid() and u.role = 'admin' and u.deleted_at is null
  );
$$;

-- Vrai si l'utilisateur courant est le manager direct de `target_id`.
-- Décision du 27/08/2026 : un manager peut LIRE et MODIFIER toutes les données
-- de son équipe (pas de restriction en lecture seule).
create or replace function public.is_manager_of(target_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs u
    where u.id = target_id and u.manager_id = auth.uid()
  );
$$;

create or replace function public.current_entreprise_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select entreprise_id from utilisateurs where id = auth.uid();
$$;

-- Un utilisateur peut agir sur une ligne qui appartient à `owner_id` si :
-- il en est l'auteur/propriétaire, ou le manager direct du propriétaire, ou admin.
create or replace function public.peut_acceder(owner_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select owner_id = auth.uid() or is_manager_of(owner_id) or is_admin();
$$;

-- Maintient `updated_at` à jour automatiquement.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_utilisateurs_updated_at before update on utilisateurs
  for each row execute function set_updated_at();
create trigger trg_taches_updated_at before update on taches
  for each row execute function set_updated_at();
