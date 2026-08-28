-- Notifications automatiques (section 10) — canal "in_app" uniquement pour
-- l'instant : les canaux e-mail/push/Slack-Teams/WhatsApp restent à brancher
-- plus tard (nécessitent des comptes/clés externes, voir README). Émises
-- côté serveur via des triggers (aucune politique INSERT client sur
-- `notifications`, décision du 27/08/2026, section 12).

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
    insert into notifications (destinataire_id, type, canal, contenu)
    values (v_manager_id, 'correction_demande', 'in_app',
            v_auteur_nom || ' a demandé une correction de pointage.');
  else
    insert into notifications (destinataire_id, type, canal, contenu)
    select id, 'correction_demande', 'in_app',
           v_auteur_nom || ' a demandé une correction de pointage.'
    from utilisateurs
    where entreprise_id = v_entreprise_id and role = 'admin' and id <> new.auteur_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifier_nouvelle_correction on corrections;
create trigger trg_notifier_nouvelle_correction
after insert on corrections
for each row execute function public.notifier_nouvelle_correction();

-- 2. Correction approuvée/refusée → notifie l'auteur de la demande.
create or replace function public.notifier_statut_correction()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut <> old.statut and new.statut in ('approuvee', 'refusee') then
    insert into notifications (destinataire_id, type, canal, contenu)
    values (
      new.auteur_id,
      case when new.statut = 'approuvee' then 'correction_approuvee' else 'correction_refusee' end,
      'in_app',
      case when new.statut = 'approuvee'
        then 'Ta demande de correction a été approuvée.'
        else 'Ta demande de correction a été refusée.'
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_statut_correction on corrections;
create trigger trg_notifier_statut_correction
after update on corrections
for each row execute function public.notifier_statut_correction();

-- 3. Nouvelle tâche assignée (ou réassignée) → notifie la personne assignée,
--    sauf si elle se l'assigne elle-même (pas de bruit inutile).
create or replace function public.notifier_tache_assignee()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigne_id is not null
     and (tg_op = 'INSERT' or new.assigne_id is distinct from old.assigne_id)
     and new.assigne_id <> auth.uid() then
    insert into notifications (destinataire_id, type, canal, contenu)
    values (new.assigne_id, 'tache_assignee', 'in_app', 'Nouvelle tâche assignée : ' || new.titre);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_tache_assignee on taches;
create trigger trg_notifier_tache_assignee
after insert or update on taches
for each row execute function public.notifier_tache_assignee();
