-- Purge définitive des lignes en soft delete après 45 jours (section 12,
-- décision du 27/08/2026). Planifiée via pg_cron (voir instructions README).
--
-- Comportement volontairement prudent : chaque suppression est tentée
-- individuellement ; si une ligne est encore référencée ailleurs (ex. une
-- tâche encore liée à des sessions de temps, un utilisateur encore auteur
-- de tâches non supprimées), elle est simplement ignorée pour cette
-- passe — elle reste soft-deleted (donc déjà invisible dans l'application)
-- et sera retentée automatiquement au prochain passage, une fois la
-- référence bloquante elle-même supprimée ou nettoyée. Rien n'est jamais
-- supprimé « en cascade » silencieusement : on ne perd que ce qui n'est
-- plus référencé nulle part.
create or replace function public.purger_soft_delete()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_seuil timestamptz := now() - interval '45 days';
  v_id uuid;
begin
  -- Ordre : des tables les plus "enfants" vers les plus "parentes", pour
  -- maximiser les suppressions réussies dès cette passe.
  for v_id in select id from commentaires where deleted_at < v_seuil loop
    begin
      delete from commentaires where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from taches where deleted_at < v_seuil loop
    begin
      delete from taches where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from utilisateurs where deleted_at < v_seuil loop
    begin
      delete from utilisateurs where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from equipes where deleted_at < v_seuil loop
    begin
      delete from equipes where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  for v_id in select id from entreprises where deleted_at < v_seuil loop
    begin
      delete from entreprises where id = v_id;
    exception when foreign_key_violation then
      null;
    end;
  end loop;
end;
$$;

-- Pas de grant à "authenticated" : cette fonction n'est jamais appelée par
-- un client, uniquement par pg_cron (contexte serveur).

-- ---------------------------------------------------------------------
-- Planification (à exécuter une fois pg_cron activé — voir README) :
--
--   select cron.schedule(
--     'purge-soft-delete-45j',
--     '0 3 * * *',                          -- tous les jours à 03h00 UTC
--     $$select public.purger_soft_delete();$$
--   );
--
-- Pour vérifier ensuite que la tâche est bien planifiée :
--   select * from cron.job;
-- Pour l'arrêter un jour si besoin :
--   select cron.unschedule('purge-soft-delete-45j');
