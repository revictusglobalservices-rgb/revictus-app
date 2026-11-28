-- Phase 2, no VAT; issued documents are immutable. Counters and snapshots are private/admin protected.
alter table public.commercial_documents drop constraint commercial_documents_statut_check;
alter table public.commercial_documents add constraint commercial_documents_statut_check check(statut in ('brouillon','emis'));
alter table public.commercial_documents add column numero text,add column emis_le timestamptz,add column emetteur jsonb,add column destinataire jsonb;
alter table public.commercial_documents add constraint commercial_document_emission_coherente check ((statut='brouillon' and numero is null and emis_le is null and emetteur is null and destinataire is null) or (statut='emis' and numero is not null and emis_le is not null and emetteur is not null and destinataire is not null));
create unique index commercial_numero_unique on public.commercial_documents(entreprise_id,numero) where numero is not null;
create unique index commercial_conversion_unique on public.commercial_documents(source_id) where type='facture' and statut='emis' and source_id is not null;
alter table public.commercial_clients add column rcs text not null default '' check(char_length(rcs)<=150),add column stat text not null default '' check(char_length(stat)<=150);
grant insert(rcs,stat),update(rcs,stat) on public.commercial_clients to authenticated;
grant update(statut) on public.commercial_documents to authenticated;
create table public.commercial_parametres (
 entreprise_id uuid primary key references public.entreprises(id),
 nom text not null check(char_length(trim(nom)) between 1 and 200),
 adresse text not null check(char_length(trim(adresse)) between 1 and 1000),
 email text not null check(char_length(trim(email)) between 1 and 320),
 rcs text not null check(char_length(trim(rcs)) between 1 and 150),
 nif text not null check(char_length(trim(nif)) between 1 and 150),
 stat text not null check(char_length(trim(stat)) between 1 and 150),
 iban text not null check(char_length(iban)<=100),
 swift text not null check(char_length(swift)<=30),
 mention_fiscale text not null check(char_length(trim(mention_fiscale)) between 1 and 500),
 logo text check(logo is null or (char_length(logo)<=400000 and logo ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')),
 confirme boolean not null default false
);
alter table public.commercial_parametres enable row level security;
revoke all on public.commercial_parametres from public,anon,authenticated;
grant select,insert,update on public.commercial_parametres to authenticated;
create policy commercial_parametres_lecture on public.commercial_parametres for select to authenticated using(revictus_private.commercial_admin(entreprise_id));
create policy commercial_parametres_creation on public.commercial_parametres for insert to authenticated with check(revictus_private.commercial_admin(entreprise_id));
create policy commercial_parametres_modification on public.commercial_parametres for update to authenticated using(revictus_private.commercial_admin(entreprise_id)) with check(revictus_private.commercial_admin(entreprise_id));
create table revictus_private.commercial_compteurs (
 entreprise_id uuid not null references public.entreprises(id),type text not null,annee int not null,dernier int not null check(dernier>0),primary key(entreprise_id,type,annee)
);
revoke all on revictus_private.commercial_compteurs from public,anon,authenticated;
create table public.commercial_reglements(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id),
 facture_id uuid not null references public.commercial_documents(id),
 auteur_id uuid not null references public.utilisateurs(id),
 jour date not null,
 montant numeric(20,2) not null check(montant>0),
 mode text not null check(mode in ('virement','especes','carte','autre')),
 reference text not null default '' check(char_length(reference)<=250),
 created_at timestamptz not null default now()
);
create index commercial_reglements_facture on public.commercial_reglements(facture_id);
alter table public.commercial_reglements enable row level security;
revoke all on public.commercial_reglements from public,anon,authenticated;
grant select on public.commercial_reglements to authenticated;
grant insert(entreprise_id,facture_id,auteur_id,jour,montant,mode,reference) on public.commercial_reglements to authenticated;
create policy commercial_reglements_lecture on public.commercial_reglements for select to authenticated using(revictus_private.commercial_admin(entreprise_id));
create policy commercial_reglements_creation on public.commercial_reglements for insert to authenticated with check(revictus_private.commercial_admin(entreprise_id) and auteur_id=(select auth.uid()));
create function revictus_private.commercial_verrouiller() returns trigger language plpgsql set search_path='' as $$
begin
 if not revictus_private.commercial_admin(new.entreprise_id) then raise exception 'Accès refusé';end if;
 if tg_op='INSERT' then
  if new.statut<>'brouillon' then raise exception 'Créer un brouillon';end if;
 elsif old.statut='emis' then raise exception 'Un document émis est immuable';
 elsif new.statut='emis' and (new.lignes is distinct from old.lignes or new.notes is distinct from old.notes or new.jour<>old.jour or new.echeance is distinct from old.echeance or new.devise<>old.devise) then raise exception 'Enregistrer le brouillon avant émission';
 end if;
 if exists(select 1 from jsonb_array_elements(new.lignes) l where (l->>'taxe')::numeric<>0) then raise exception 'TVA non applicable à cette configuration';end if;
 return new;
end;$$;
revoke all on function revictus_private.commercial_verrouiller() from public,anon,authenticated;
create trigger a_commercial_verrouiller before insert or update on public.commercial_documents for each row execute function revictus_private.commercial_verrouiller();
create function revictus_private.commercial_emettre() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.commercial_parametres%rowtype; dest public.commercial_clients%rowtype; src public.commercial_documents%rowtype; seq int; yr int; prefix text; credits numeric; payments numeric;
begin
 if new.statut<>'emis' then return new;end if;
 if tg_op<>'UPDATE' or old.statut<>'brouillon' or not revictus_private.commercial_admin(new.entreprise_id) then raise exception 'Émission refusée';end if;
 if new.jour<>(now() at time zone 'Indian/Antananarivo')::date then raise exception 'La date du document doit être la date d’émission';end if;
 if new.total_ttc<=0 or new.total_taxe<>0 then raise exception 'Montant non valide';end if;
 if new.type='facture' and new.echeance is null then raise exception 'Échéance requise';end if;
 select * into cfg from public.commercial_parametres where entreprise_id=new.entreprise_id;
 if not found or not cfg.confirme or cfg.logo is null or trim(cfg.iban)='' or trim(cfg.swift)='' then raise exception 'Paramètres de facturation à confirmer';end if;
 select * into dest from public.commercial_clients where id=new.client_id and entreprise_id=new.entreprise_id;
 if not found or trim(dest.adresse)='' or trim(dest.pays)='' then raise exception 'Adresse du client requise';end if;
 if new.source_id is not null then
  select * into src from public.commercial_documents where id=new.source_id and entreprise_id=new.entreprise_id and client_id=new.client_id for update;
  if not found or src.statut<>'emis' or src.devise<>new.devise then raise exception 'Source émise requise';end if;
  if new.type='avoir' then
   select coalesce(sum(total_ttc),0) into credits from public.commercial_documents where source_id=src.id and type='avoir' and statut='emis';
   select coalesce(sum(montant),0) into payments from public.commercial_reglements where facture_id=src.id;
   if new.total_ttc+credits+payments>src.total_ttc then raise exception 'L’avoir dépasse le solde disponible ; remboursement à traiter séparément';end if;
  end if;
 end if;
 yr:=extract(year from new.jour)::int;
 prefix:=case new.type when 'devis' then 'DEV' when 'facture' then 'FAC' else 'AV' end;
 insert into revictus_private.commercial_compteurs(entreprise_id,type,annee,dernier) values(new.entreprise_id,new.type,yr,1)
 on conflict(entreprise_id,type,annee) do update set dernier=revictus_private.commercial_compteurs.dernier+1 returning dernier into seq;
 new.numero:=prefix||'-'||yr||'-'||lpad(seq::text,greatest(4,char_length(seq::text)),'0');
 new.emis_le:=now();new.emetteur:=to_jsonb(cfg)-'confirme'-'entreprise_id';new.destinataire:=to_jsonb(dest)-'entreprise_id'-'client_operationnel_id'-'created_at';
 return new;
end;$$;
revoke all on function revictus_private.commercial_emettre() from public,anon,authenticated;
create trigger z_commercial_emettre before update on public.commercial_documents for each row execute function revictus_private.commercial_emettre();
create function revictus_private.commercial_reglement_verifier() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.commercial_documents%rowtype; paid numeric; credited numeric;
begin
 if not revictus_private.commercial_admin(new.entreprise_id) or new.auteur_id<>auth.uid() then raise exception 'Accès refusé';end if;
 select * into f from public.commercial_documents where id=new.facture_id and entreprise_id=new.entreprise_id for update;
 if not found or f.type<>'facture' or f.statut<>'emis' or new.jour<f.jour or new.jour>(now() at time zone 'Indian/Antananarivo')::date then raise exception 'Facture ou date non valide';end if;
 select coalesce(sum(montant),0) into paid from public.commercial_reglements where facture_id=f.id;
 select coalesce(sum(total_ttc),0) into credited from public.commercial_documents where source_id=f.id and type='avoir' and statut='emis';
 if paid+credited+new.montant>f.total_ttc then raise exception 'Montant supérieur au solde';end if;
 return new;
end;$$;
revoke all on function revictus_private.commercial_reglement_verifier() from public,anon,authenticated;
create trigger commercial_reglement_verifier before insert on public.commercial_reglements for each row execute function revictus_private.commercial_reglement_verifier();
