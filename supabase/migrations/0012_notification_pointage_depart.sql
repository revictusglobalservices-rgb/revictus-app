-- Même alerte que 0011, mais pour le départ (check-out) — demande du
-- 29/08/2026. `pointer_depart()` (0004_pointage_rpc.sql) fait un UPDATE
-- (pas un INSERT) qui passe `statut` de 'ouvert' à 'ferme' et renseigne
-- `check_out`/`duree_secondes` ; le trigger se déclenche donc sur ce
-- changement de statut précis, pour ne pas notifier sur les autres UPDATE
-- possibles (aucun autre pour l'instant, mais par prudence).

create or replace function public.notifier_pointage_depart()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager_id uuid;
  v_entreprise_id uuid;
  v_nom text;
  v_heure text;
  v_duree text;
  v_lien text;
begin
  if new.statut <> 'ferme' or old.statut = 'ferme' then
    return new;
  end if;

  select manager_id, entreprise_id, nom into v_manager_id, v_entreprise_id, v_nom
  from utilisateurs where id = new.utilisateur_id;

  v_heure := to_char(new.check_out at time zone 'Indian/Antananarivo', 'HH24:MI');
  v_duree := (coalesce(new.duree_secondes, 0) / 3600) || 'h' ||
             lpad(((coalesce(new.duree_secondes, 0) % 3600) / 60)::text, 2, '0');
  v_lien := '/manager/equipe/' || new.utilisateur_id;

  if v_manager_id is not null then
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (v_manager_id, 'pointage_depart', 'in_app',
            v_nom || ' a pointé son départ à ' || v_heure || ' (' || v_duree || ').', v_lien);
  else
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    select id, 'pointage_depart', 'in_app',
           v_nom || ' a pointé son départ à ' || v_heure || ' (' || v_duree || ').', v_lien
    from utilisateurs
    where entreprise_id = v_entreprise_id and role = 'admin' and id <> new.utilisateur_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifier_pointage_depart on pointages;
create trigger trg_notifier_pointage_depart
after update on pointages
for each row execute function public.notifier_pointage_depart();
