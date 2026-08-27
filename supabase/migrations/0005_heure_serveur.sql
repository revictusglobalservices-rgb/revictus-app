-- Petite fonction pour permettre au client de connaître l'heure serveur et
-- calculer un décalage d'horloge (voir 0004 : les horodatages stockés sont déjà
-- calculés côté serveur, mais l'affichage en direct du chrono/pointage utilisait
-- Date.now() du navigateur, ce qui réintroduit le décalage à l'affichage).
create or replace function public.heure_serveur()
returns timestamptz
language sql stable as $$
  select now();
$$;

grant execute on function public.heure_serveur() to authenticated;

-- Même correctif que 0004 (pointer_depart) mais pour le Chrono : `fin` et
-- `duree_secondes` calculés côté serveur plutôt qu'avec l'horloge du navigateur.
create or replace function public.arreter_session(p_id uuid)
returns sessions_temps
language plpgsql security definer set search_path = public as $$
declare
  v_row sessions_temps;
begin
  update sessions_temps
  set fin = now(),
      duree_secondes = greatest(0, extract(epoch from (now() - debut))::int)
  where id = p_id and utilisateur_id = auth.uid()
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.arreter_session(uuid) to authenticated;
