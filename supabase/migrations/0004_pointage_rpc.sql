-- Fonctions RPC pour le pointage et les pauses.
-- Toutes les horodatages sont calculés côté serveur (now()) pour éviter
-- tout écart lié à l'horloge du poste client (constaté en test le 27/08/2026 :
-- check_in pris côté client vs pauses.debut par défaut côté serveur → durées
-- négatives/incohérentes en cas de décalage d'horloge navigateur/serveur).

create or replace function public.pointer_arrivee(p_date date)
returns pointages
language plpgsql security definer set search_path = public as $$
declare
  v_row pointages;
begin
  insert into pointages (utilisateur_id, date, check_in, statut)
  values (auth.uid(), p_date, now(), 'ouvert')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.pointer_depart(p_id uuid)
returns pointages
language plpgsql security definer set search_path = public as $$
declare
  v_row pointages;
  v_pause_secondes int;
begin
  select coalesce(sum(extract(epoch from (coalesce(fin, now()) - debut)))::int, 0)
  into v_pause_secondes
  from pauses where pointage_id = p_id;

  update pointages
  set check_out = now(),
      statut = 'ferme',
      duree_secondes = greatest(0, extract(epoch from (now() - check_in))::int - v_pause_secondes)
  where id = p_id and utilisateur_id = auth.uid()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.demarrer_pause(p_pointage_id uuid, p_type type_pause)
returns pauses
language plpgsql security definer set search_path = public as $$
declare
  v_row pauses;
begin
  insert into pauses (pointage_id, type, debut)
  select p_pointage_id, p_type, now()
  where exists (
    select 1 from pointages
    where id = p_pointage_id and utilisateur_id = auth.uid() and statut = 'ouvert'
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.terminer_pause(p_pause_id uuid)
returns pauses
language plpgsql security definer set search_path = public as $$
declare
  v_row pauses;
begin
  update pauses
  set fin = now()
  where id = p_pause_id
    and exists (
      select 1 from pointages pt
      where pt.id = pauses.pointage_id and pt.utilisateur_id = auth.uid()
    )
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.pointer_arrivee(date) to authenticated;
grant execute on function public.pointer_depart(uuid) to authenticated;
grant execute on function public.demarrer_pause(uuid, type_pause) to authenticated;
grant execute on function public.terminer_pause(uuid) to authenticated;
