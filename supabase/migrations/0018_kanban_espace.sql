-- Kanban : espace personnel vs espace partagé (décision du 01/09/2026, suite à
-- l'amélioration du Kanban). Jusqu'ici un collaborateur ne voyait sur le
-- Kanban que ses propres tâches (assigné ou créateur) — pas de vraie vue
-- d'équipe façon Trello, ce qui donnait l'impression d'un tableau "personnel".
--
-- On introduit deux espaces sur le même tableau (mêmes colonnes —
-- colonnes_kanban ne change pas, décision confirmée) :
--   - personnel : comportement inchangé, visible/modifiable par le
--     propriétaire (assigné ou créateur), son manager, ou un admin
--     (peut_acceder(), déjà en place).
--   - partage   : visible ET modifiable par tout le monde dans l'entreprise —
--     un vrai tableau d'équipe partagé façon Trello.
-- Toutes les tâches existantes basculent en 'personnel' par défaut : aucun
-- changement de comportement pour l'historique.

create type type_espace_tache as enum ('personnel', 'partage');

alter table taches add column espace type_espace_tache not null default 'personnel';

drop policy if exists "taches: lecture" on taches;
create policy "taches: lecture" on taches for select
  using (
    (espace = 'partage' and entreprise_id = current_entreprise_id())
    or (espace = 'personnel' and (peut_acceder(assigne_id) or peut_acceder(createur_id)))
  );

drop policy if exists "taches: modification" on taches;
create policy "taches: modification" on taches for update
  using (
    (espace = 'partage' and entreprise_id = current_entreprise_id())
    or (espace = 'personnel' and (peut_acceder(assigne_id) or peut_acceder(createur_id)))
  );

drop policy if exists "dependances: lecture" on taches_dependances;
create policy "dependances: lecture" on taches_dependances for select
  using (exists (
    select 1 from taches t where t.id = tache_id
    and (
      (t.espace = 'partage' and t.entreprise_id = current_entreprise_id())
      or (t.espace = 'personnel' and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id)))
    )
  ));

drop policy if exists "dependances: creation" on taches_dependances;
create policy "dependances: creation" on taches_dependances for insert
  with check (exists (
    select 1 from taches t where t.id = tache_id
    and (
      (t.espace = 'partage' and t.entreprise_id = current_entreprise_id())
      or (t.espace = 'personnel' and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id)))
    )
  ));

drop policy if exists "commentaires: lecture" on commentaires;
create policy "commentaires: lecture" on commentaires for select
  using (exists (
    select 1 from taches t where t.id = tache_id
    and (
      (t.espace = 'partage' and t.entreprise_id = current_entreprise_id())
      or (t.espace = 'personnel' and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id)))
    )
  ));
