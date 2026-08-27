-- Corrections en attente (section 6) : un collaborateur demande la correction
-- d'un pointage clos (arrivée/départ erronés) ; son manager (ou un admin)
-- approuve ou refuse. L'approbation applique la nouvelle valeur au pointage
-- cible et recalcule duree_secondes — côté serveur uniquement, pour ne pas
-- dépendre de ce qu'un client pourrait renvoyer.
--
-- La création de la demande reste un insert direct (policy "corrections:
-- creation", déjà en place) : il s'agit d'une heure choisie par l'utilisateur,
-- pas d'une action "maintenant" — pas besoin de RPC pour ça. Seules
-- l'approbation et le refus, qui mutent la ligne cible, passent par RPC.

create or replace function public.approuver_correction(p_id uuid)
returns corrections
language plpgsql security definer set search_path = public as $$
declare
  v_correction corrections;
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_secondes_pauses int;
begin
  select * into v_correction from corrections where id = p_id;

  if v_correction is null then
    raise exception 'Correction introuvable';
  end if;

  if not (is_manager_of(v_correction.auteur_id) or is_admin()) then
    raise exception 'Non autorisé';
  end if;

  if v_correction.statut <> 'en_attente' then
    raise exception 'Cette demande a déjà été traitée';
  end if;

  if v_correction.table_cible = 'pointages' then
    v_check_in := coalesce((v_correction.nouvelle_valeur->>'check_in')::timestamptz, null);
    v_check_out := coalesce((v_correction.nouvelle_valeur->>'check_out')::timestamptz, null);

    select coalesce(sum(extract(epoch from (coalesce(fin, now()) - debut))::int), 0)
    into v_secondes_pauses
    from pauses
    where pointage_id = v_correction.ligne_id;

    update pointages
    set check_in = coalesce(v_check_in, check_in),
        check_out = coalesce(v_check_out, check_out),
        duree_secondes = case
          when coalesce(v_check_out, check_out) is not null then
            greatest(0, extract(epoch from (coalesce(v_check_out, check_out) - coalesce(v_check_in, check_in)))::int - v_secondes_pauses)
          else duree_secondes
        end
    where id = v_correction.ligne_id;
  end if;

  update corrections
  set statut = 'approuvee', approbateur_id = auth.uid()
  where id = p_id
  returning * into v_correction;

  return v_correction;
end;
$$;

grant execute on function public.approuver_correction(uuid) to authenticated;

create or replace function public.refuser_correction(p_id uuid)
returns corrections
language plpgsql security definer set search_path = public as $$
declare
  v_correction corrections;
begin
  select * into v_correction from corrections where id = p_id;

  if v_correction is null then
    raise exception 'Correction introuvable';
  end if;

  if not (is_manager_of(v_correction.auteur_id) or is_admin()) then
    raise exception 'Non autorisé';
  end if;

  if v_correction.statut <> 'en_attente' then
    raise exception 'Cette demande a déjà été traitée';
  end if;

  update corrections
  set statut = 'refusee', approbateur_id = auth.uid()
  where id = p_id
  returning * into v_correction;

  return v_correction;
end;
$$;

grant execute on function public.refuser_correction(uuid) to authenticated;
