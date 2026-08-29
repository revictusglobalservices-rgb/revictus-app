-- Alerte (in-app + e-mail) quand un collaborateur pointe son arrivée —
-- demande du 29/08/2026. Même mécanisme que les notifications existantes
-- (0008/0010) : un insert dans `notifications` déclenche automatiquement
-- l'e-mail via le trigger `trg_envoyer_email_notification` (0009), aucune
-- modification nécessaire côté e-mail à part le sujet (voir
-- src/app/api/notifications/email/route.ts).
--
-- Notifie le manager direct du collaborateur, ou tous les admins de
-- l'entreprise s'il n'a pas de manager (même règle que pour les demandes
-- de correction). `pointer_arrivee()` (0004_pointage_rpc.sql) insère
-- toujours `check_in` en même temps que la ligne, donc un simple
-- AFTER INSERT suffit.

create or replace function public.notifier_pointage_arrivee()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager_id uuid;
  v_entreprise_id uuid;
  v_nom text;
  v_heure text;
  v_lien text;
begin
  select manager_id, entreprise_id, nom into v_manager_id, v_entreprise_id, v_nom
  from utilisateurs where id = new.utilisateur_id;

  v_heure := to_char(new.check_in at time zone 'Indian/Antananarivo', 'HH24:MI');
  v_lien := '/manager/equipe/' || new.utilisateur_id;

  if v_manager_id is not null then
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (v_manager_id, 'pointage_arrivee', 'in_app',
            v_nom || ' a pointé son arrivée à ' || v_heure || '.', v_lien);
  else
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    select id, 'pointage_arrivee', 'in_app',
           v_nom || ' a pointé son arrivée à ' || v_heure || '.', v_lien
    from utilisateurs
    where entreprise_id = v_entreprise_id and role = 'admin' and id <> new.utilisateur_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifier_pointage_arrivee on pointages;
create trigger trg_notifier_pointage_arrivee
after insert on pointages
for each row execute function public.notifier_pointage_arrivee();
