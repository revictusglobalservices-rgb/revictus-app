-- Kanban : pièces jointes sur les tâches (02/09/2026, dernier chantier ajourné
-- du Kanban). Un bucket de stockage privé (taches-pieces-jointes, 15 Mo max
-- par fichier) + une table de métadonnées pieces_jointes, sécurisés par les
-- mêmes règles de visibilité que les tâches elles-mêmes (espace
-- personnel/partagé, cf. 0018_kanban_espace.sql) : qui peut voir/modifier une
-- tâche peut voir/ajouter/supprimer ses pièces jointes — que ce soit via la
-- table de métadonnées ou directement sur le fichier dans le bucket.
--
-- Convention de chemin de stockage : "<tache_id>/<uuid>-<nom_fichier>" — le
-- premier segment du chemin (storage.foldername(name))[1] sert d'ancrage aux
-- policies sur storage.objects pour retrouver la tâche concernée.
--
-- Suppression immédiate (pas de soft delete, contrairement au reste de
-- l'app) : un fichier supprimé libère tout de suite l'espace de stockage —
-- inutile de garder 45 jours un fichier binaire supprimé volontairement.

insert into storage.buckets (id, name, public, file_size_limit)
values ('taches-pieces-jointes', 'taches-pieces-jointes', false, 15728640)
on conflict (id) do nothing;

-- Vrai si l'utilisateur courant peut voir/modifier la tâche `p_tache_id`,
-- selon les mêmes règles que "taches: lecture"/"taches: modification"
-- (0018_kanban_espace.sql). Centralisé ici pour être réutilisé par les
-- policies de storage.objects (qui n'ont accès qu'à un chemin, pas à la ligne
-- taches) et par la table pieces_jointes.
create or replace function public.peut_acceder_tache_id(p_tache_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from taches t
    where t.id = p_tache_id
    and (
      (t.espace = 'partage' and t.entreprise_id = current_entreprise_id())
      or (t.espace = 'personnel' and (peut_acceder(t.assigne_id) or peut_acceder(t.createur_id)))
    )
  );
$$;

create policy "pieces-jointes: lecture" on storage.objects for select
  using (bucket_id = 'taches-pieces-jointes' and peut_acceder_tache_id(((storage.foldername(name))[1])::uuid));

create policy "pieces-jointes: televersement" on storage.objects for insert
  with check (bucket_id = 'taches-pieces-jointes' and peut_acceder_tache_id(((storage.foldername(name))[1])::uuid));

create policy "pieces-jointes: suppression" on storage.objects for delete
  using (bucket_id = 'taches-pieces-jointes' and peut_acceder_tache_id(((storage.foldername(name))[1])::uuid));

create table pieces_jointes (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references taches(id) on delete cascade,
  chemin_stockage text not null,
  nom_fichier text not null,
  taille_octets bigint not null,
  type_mime text,
  auteur_id uuid not null references utilisateurs(id),
  created_at timestamptz not null default now()
);
create index idx_pieces_jointes_tache on pieces_jointes(tache_id);

alter table pieces_jointes enable row level security;

create policy "pieces_jointes: lecture" on pieces_jointes for select
  using (peut_acceder_tache_id(tache_id));
create policy "pieces_jointes: creation" on pieces_jointes for insert
  with check (auteur_id = auth.uid() and peut_acceder_tache_id(tache_id));
create policy "pieces_jointes: suppression" on pieces_jointes for delete
  using (peut_acceder_tache_id(tache_id));
