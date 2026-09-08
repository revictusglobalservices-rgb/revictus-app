-- Pièces jointes sur les idées (demande d'Angelo, 08/09/2026) : pouvoir
-- joindre une capture d'écran ou un fichier à une idée pour l'illustrer.
-- Repris à l'identique du même besoin sur le Kanban (0019_kanban_pieces_jointes.sql) :
-- bucket privé (15 Mo max/fichier), table de métadonnées, suppression
-- immédiate (pas de soft delete — inutile de garder 45 jours un fichier
-- binaire supprimé volontairement), téléchargement/aperçu via URL signée.
--
-- Visibilité : qui peut voir l'idée (RLS "idees: lecture", 0021) peut voir
-- ses pièces jointes — que ce soit via la table de métadonnées ou
-- directement sur le fichier dans le bucket. Ajout/suppression d'une pièce
-- jointe : mêmes règles que la modification de l'idée elle-même (auteur tant
-- qu'elle est en attente, admin à tout moment) — voir peut_modifier_idee_id
-- ci-dessous.
--
-- Convention de chemin de stockage (identique au Kanban) :
-- "<idee_id>/<uuid>-<nom_fichier>" — le premier segment
-- ((storage.foldername(name))[1]) sert d'ancrage aux policies sur
-- storage.objects pour retrouver l'idée concernée.

insert into storage.buckets (id, name, public, file_size_limit)
values ('idees-pieces-jointes', 'idees-pieces-jointes', false, 15728640)
on conflict (id) do nothing;

-- Vrai si l'utilisateur courant peut voir l'idée `p_idee_id` — reprend
-- exactement la condition de "idees: lecture" (0021_boite_a_idees.sql).
-- Centralisé ici pour être réutilisé par les policies de storage.objects
-- (qui n'ont accès qu'à un chemin, pas à la ligne idees) et par la table
-- idees_pieces_jointes.
create or replace function public.peut_voir_idee_id(p_idee_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from idees i
    where i.id = p_idee_id
    and (is_admin() or i.auteur_id = auth.uid() or (i.statut = 'validee' and not i.auteur_est_admin))
  );
$$;

-- Vrai si l'utilisateur courant peut ajouter/retirer une pièce jointe sur
-- l'idée `p_idee_id` — reprend exactement la condition de
-- "idees: modification" (0021_boite_a_idees.sql) : l'auteur tant qu'elle
-- n'a pas encore été traitée, l'admin à tout moment.
create or replace function public.peut_modifier_idee_id(p_idee_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from idees i
    where i.id = p_idee_id
    and (is_admin() or (i.auteur_id = auth.uid() and i.statut = 'en_attente'))
  );
$$;

create policy "idees-pieces-jointes: lecture" on storage.objects for select
  using (bucket_id = 'idees-pieces-jointes' and peut_voir_idee_id(((storage.foldername(name))[1])::uuid));

create policy "idees-pieces-jointes: televersement" on storage.objects for insert
  with check (bucket_id = 'idees-pieces-jointes' and peut_modifier_idee_id(((storage.foldername(name))[1])::uuid));

create policy "idees-pieces-jointes: suppression" on storage.objects for delete
  using (bucket_id = 'idees-pieces-jointes' and peut_modifier_idee_id(((storage.foldername(name))[1])::uuid));

create table idees_pieces_jointes (
  id uuid primary key default gen_random_uuid(),
  idee_id uuid not null references idees(id) on delete cascade,
  chemin_stockage text not null,
  nom_fichier text not null,
  taille_octets bigint not null,
  type_mime text,
  auteur_id uuid not null references utilisateurs(id),
  created_at timestamptz not null default now()
);
create index idx_idees_pieces_jointes_idee on idees_pieces_jointes(idee_id);

alter table idees_pieces_jointes enable row level security;

create policy "idees_pieces_jointes: lecture" on idees_pieces_jointes for select
  using (peut_voir_idee_id(idee_id));
create policy "idees_pieces_jointes: creation" on idees_pieces_jointes for insert
  with check (auteur_id = auth.uid() and peut_modifier_idee_id(idee_id));
create policy "idees_pieces_jointes: suppression" on idees_pieces_jointes for delete
  using (peut_modifier_idee_id(idee_id));
