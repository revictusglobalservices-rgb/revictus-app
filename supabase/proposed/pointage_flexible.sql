-- Paramètres facultatifs; les collaborateurs existants restent en mode fixe.
alter table public.utilisateurs
  add column if not exists mode_pointage text not null default 'fixe' check (mode_pointage in ('fixe','flexible')),
  add column if not exists objectif_minutes integer check (objectif_minutes between 30 and 960),
  add column if not exists flexible_depuis date;
create table if not exists public.pointages_flexibles (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.utilisateurs(id),
  debut timestamptz not null default now(),
  fin timestamptz,
  check(fin is null or fin >= debut)
);
create unique index if not exists pointages_flexibles_ouvert on public.pointages_flexibles(utilisateur_id) where fin is null;
create index if not exists pointages_flexibles_historique on public.pointages_flexibles(utilisateur_id,debut);
alter table public.pointages_flexibles enable row level security;
revoke all on public.pointages_flexibles from anon, authenticated, public;
grant select on public.pointages_flexibles to authenticated;
grant select,insert,update on public.pointages_flexibles to service_role;
create policy "lecture pointages flexibles" on public.pointages_flexibles for select to authenticated
using (exists (select 1 from public.utilisateurs cible join public.utilisateurs lecteur on lecteur.id=(select auth.uid()) where cible.id=utilisateur_id and lecteur.statut='actif' and lecteur.deleted_at is null and cible.entreprise_id=lecteur.entreprise_id and (cible.id=lecteur.id or lecteur.role='admin' or (lecteur.role='manager' and cible.manager_id=lecteur.id))));

-- Prevent a stale fixed-mode client from starting a new fixed shift after activation.
create or replace function public.verifier_mode_pointage_fixe()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if exists(select 1 from public.utilisateurs where id=new.utilisateur_id and mode_pointage='flexible' and flexible_depuis <= (now() at time zone 'Indian/Antananarivo')::date) then
    raise exception 'Le mode flexible est actif pour ce compte.';
  end if;
  return new;
end;
$$;
create trigger verifier_mode_pointage_fixe before insert on public.pointages
for each row execute function public.verifier_mode_pointage_fixe();
