-- Corrige deux points signalés le 28/08/2026 lors du test des notifications :
--
--   1. La cloche n'affichait le badge/la nouvelle notification qu'après un
--      rafraîchissement manuel de la page : contrairement à `corrections`,
--      la table `notifications` n'avait jamais été ajoutée à la publication
--      Realtime de Supabase, donc l'abonnement `postgres_changes` côté
--      client (voir NotificationsBell.tsx) ne recevait aucun événement.
--
--   2. Impossible de cliquer une notification pour aller directement à la
--      page concernée : ajout d'une colonne `lien`, renseignée par chaque
--      trigger, utilisée côté client pour rediriger au clic.
--
-- À exécuter après 0009_email_notifications.sql.

alter publication supabase_realtime add table notifications;

alter table notifications add column if not exists lien text;

-- 1. Nouvelle demande de correction → notifie le manager direct de l'auteur,
--    ou tous les admins de l'entreprise si l'auteur n'a pas de manager.
create or replace function public.notifier_nouvelle_correction()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_manager_id uuid;
  v_entreprise_id uuid;
  v_auteur_nom text;
begin
  select manager_id, entreprise_id, nom into v_manager_id, v_entreprise_id, v_auteur_nom
  from utilisateurs where id = new.auteur_id;

  if v_manager_id is not null then
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (v_manager_id, 'correction_demande', 'in_app',
            v_auteur_nom || ' a demandé une correction de pointage.', '/corrections');
  else
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    select id, 'correction_demande', 'in_app',
           v_auteur_nom || ' a demandé une correction de pointage.', '/corrections'
    from utilisateurs
    where entreprise_id = v_entreprise_id and role = 'admin' and id <> new.auteur_id;
  end if;

  return new;
end;
$$;

-- 2. Correction approuvée/refusée → notifie l'auteur de la demande.
create or replace function public.notifier_statut_correction()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut <> old.statut and new.statut in ('approuvee', 'refusee') then
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (
      new.auteur_id,
      case when new.statut = 'approuvee' then 'correction_approuvee' else 'correction_refusee' end,
      'in_app',
      case when new.statut = 'approuvee'
        then 'Ta demande de correction a été approuvée.'
        else 'Ta demande de correction a été refusée.'
      end,
      '/pointage'
    );
  end if;
  return new;
end;
$$;

-- 3. Nouvelle tâche assignée (ou réassignée) → notifie la personne assignée,
--    sauf si elle se l'assigne elle-même (pas de bruit inutile).
create or replace function public.notifier_tache_assignee()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigne_id is not null
     and (tg_op = 'INSERT' or new.assigne_id is distinct from old.assigne_id)
     and new.assigne_id <> auth.uid() then
    insert into notifications (destinataire_id, type, canal, contenu, lien)
    values (new.assigne_id, 'tache_assignee', 'in_app', 'Nouvelle tâche assignée : ' || new.titre, '/kanban');
  end if;
  return new;
end;
$$;
