-- Amélioration Kanban (décision du 30/08/2026, phase "panneau de tâche
-- complet") : le schéma taches/commentaires/colonnes_kanban et ses politiques
-- RLS existaient déjà en grande partie depuis les fondations (description,
-- échéance, assigné, commentaires, gestion des colonnes réservée à l'admin) —
-- seule la mention d'une personne dans un commentaire est nouvelle et
-- nécessite une colonne + un trigger de notification.
--
-- Choix : les mentions sont sélectionnées par l'auteur du commentaire dans
-- une liste (chips cliquables côté front), pas extraites d'un texte libre
-- "@Nom" — plus fiable (pas d'ambiguïté d'homonymes, pas de parsing fragile).

alter table commentaires add column mentions uuid[] not null default '{}';

create or replace function public.notifier_commentaire_mention()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_auteur_nom text;
  v_titre_tache text;
  v_mention_id uuid;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then
    return new;
  end if;

  select nom into v_auteur_nom from utilisateurs where id = new.auteur_id;
  select titre into v_titre_tache from taches where id = new.tache_id;

  foreach v_mention_id in array new.mentions loop
    if v_mention_id <> new.auteur_id then
      insert into notifications (destinataire_id, type, canal, contenu, lien)
      values (
        v_mention_id,
        'tache_mention',
        'in_app',
        v_auteur_nom || ' t''a mentionné dans un commentaire sur « ' || coalesce(v_titre_tache, 'une tâche') || ' ».',
        '/kanban?tache=' || new.tache_id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notifier_commentaire_mention on commentaires;
create trigger trg_notifier_commentaire_mention
after insert on commentaires
for each row execute function public.notifier_commentaire_mention();
