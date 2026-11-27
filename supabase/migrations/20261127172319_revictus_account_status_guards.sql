-- Restriction des accès pour les comptes suspendus ou archivés.
create schema if not exists revictus_private;
revoke all on schema revictus_private from public, anon;
grant usage on schema revictus_private to authenticated;
create or replace function revictus_private.compte_actif()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.utilisateurs where id=(select auth.uid()) and statut='actif' and deleted_at is null);
$$;
revoke all on function revictus_private.compte_actif() from public, anon;
grant execute on function revictus_private.compte_actif() to authenticated;
create or replace function revictus_private.verifier_compte_ecriture()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not revictus_private.compte_actif() then
   raise exception 'Accès au compte indisponible.' using errcode='42501';
 end if;
 return null;
end;
$$;
revoke all on function revictus_private.verifier_compte_ecriture() from public, anon, authenticated;
create policy "revictus_compte_actif" on public.colonnes_kanban as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.colonnes_kanban for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.commentaires as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.commentaires for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.conges_absences as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.conges_absences for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.corrections as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.corrections for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.entreprises as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.entreprises for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.equipes as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.equipes for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.historique as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.historique for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.idees as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.idees for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.idees_pieces_jointes as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.idees_pieces_jointes for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.idees_votes as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.idees_votes for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.notifications as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.notifications for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.pauses as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.pauses for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.pieces_jointes as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.pieces_jointes for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.planning_entrees as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.planning_entrees for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.planning_recurrences as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.planning_recurrences for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.pointages as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.pointages for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.pointages_flexibles as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.pointages_flexibles for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.sessions_temps as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.sessions_temps for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.taches as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.taches for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.taches_dependances as restrictive for all to authenticated using (((select revictus_private.compte_actif()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.taches_dependances for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on public.utilisateurs as restrictive for all to authenticated using (((select revictus_private.compte_actif()) or id=(select auth.uid()))) with check ((select revictus_private.compte_actif()));
create trigger revictus_compte_actif_ecriture before insert or update or delete on public.utilisateurs for each statement execute function revictus_private.verifier_compte_ecriture();
create policy "revictus_compte_actif" on storage.objects as restrictive for all to authenticated using ((select revictus_private.compte_actif())) with check ((select revictus_private.compte_actif()));
