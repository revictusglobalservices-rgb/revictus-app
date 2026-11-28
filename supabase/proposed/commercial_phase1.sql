-- Phase 1: commercial draft workspace. No issued invoices, payments or accounting posting.
create table public.commercial_clients (
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id),
 client_operationnel_id uuid references public.clients(id),
 nom text not null check(char_length(trim(nom)) between 1 and 200),
 email text not null default '' check(char_length(email)<=320),
 adresse text not null default '' check(char_length(adresse)<=1000),
 pays text not null default '' check(char_length(pays)<=100),
 identifiant_fiscal text not null default '' check(char_length(identifiant_fiscal)<=150),
 devise text not null check(devise in ('USD','EUR','MGA','CHF','CAD')),
 created_at timestamptz not null default now()
);
create unique index commercial_client_operationnel_unique on public.commercial_clients(client_operationnel_id) where client_operationnel_id is not null;
create table public.commercial_documents (
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id),
 client_id uuid not null references public.commercial_clients(id),
 auteur_id uuid not null references public.utilisateurs(id),
 type text not null check(type in ('devis','facture','avoir')),
 source_id uuid references public.commercial_documents(id),
 jour date not null,
 echeance date,
 devise text not null check(devise in ('USD','EUR','MGA','CHF','CAD')),
 lignes jsonb not null,
 total_ht numeric(20,2) not null default 0,
 total_taxe numeric(20,2) not null default 0,
 total_ttc numeric(20,2) not null default 0,
 notes text not null default '' check(char_length(notes)<=4000),
 statut text not null default 'brouillon' check(statut='brouillon'),
 version int not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(echeance is null or echeance>=jour)
);
create index commercial_documents_entreprise_date on public.commercial_documents(entreprise_id,jour);
alter table public.commercial_clients enable row level security;
alter table public.commercial_documents enable row level security;
revoke all on public.commercial_clients,public.commercial_documents from public,anon,authenticated;
grant select on public.commercial_clients,public.commercial_documents to authenticated;
grant insert(entreprise_id,client_operationnel_id,nom,email,adresse,pays,identifiant_fiscal,devise) on public.commercial_clients to authenticated;
grant update(nom,email,adresse,pays,identifiant_fiscal,devise) on public.commercial_clients to authenticated;
grant insert(entreprise_id,client_id,auteur_id,type,source_id,jour,echeance,devise,lignes,notes) on public.commercial_documents to authenticated;
grant update(jour,echeance,devise,lignes,notes) on public.commercial_documents to authenticated;
create function revictus_private.commercial_admin(p_entreprise uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.utilisateurs u where u.id=auth.uid() and u.entreprise_id=p_entreprise and u.role='admin' and u.statut='actif' and u.deleted_at is null);
$$;
revoke all on function revictus_private.commercial_admin(uuid) from public,anon,authenticated;
grant execute on function revictus_private.commercial_admin(uuid) to authenticated;
create policy commercial_clients_lecture on public.commercial_clients for select to authenticated using(revictus_private.commercial_admin(entreprise_id));
create policy commercial_clients_creation on public.commercial_clients for insert to authenticated with check(revictus_private.commercial_admin(entreprise_id) and (client_operationnel_id is null or exists(select 1 from public.clients c where c.id=client_operationnel_id and c.entreprise_id=commercial_clients.entreprise_id)));
create policy commercial_clients_modification on public.commercial_clients for update to authenticated using(revictus_private.commercial_admin(entreprise_id)) with check(revictus_private.commercial_admin(entreprise_id));
create policy commercial_documents_lecture on public.commercial_documents for select to authenticated using(revictus_private.commercial_admin(entreprise_id));
create policy commercial_documents_creation on public.commercial_documents for insert to authenticated with check(revictus_private.commercial_admin(entreprise_id) and auteur_id=(select auth.uid()));
create policy commercial_documents_modification on public.commercial_documents for update to authenticated using(revictus_private.commercial_admin(entreprise_id)) with check(revictus_private.commercial_admin(entreprise_id));
create function revictus_private.commercial_calcul() returns trigger language plpgsql set search_path='' as $$
declare l jsonb; q numeric; p numeric; t numeric; ht numeric; taxe numeric; src public.commercial_documents%rowtype;
begin
 if not revictus_private.commercial_admin(new.entreprise_id) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.commercial_clients c where c.id=new.client_id and c.entreprise_id=new.entreprise_id) then raise exception 'Client non valide';end if;
 if tg_op='INSERT' and new.auteur_id<>auth.uid() then raise exception 'Auteur non valide';end if;
 if tg_op='UPDATE' then
  if new.entreprise_id<>old.entreprise_id or new.client_id<>old.client_id or new.auteur_id<>old.auteur_id or new.type<>old.type or new.source_id is distinct from old.source_id then raise exception 'Identité immuable';end if;
  new.version:=old.version+1;
 end if;
 if new.source_id is not null then
  select * into src from public.commercial_documents where id=new.source_id and entreprise_id=new.entreprise_id and client_id=new.client_id;
  if not found or new.devise<>src.devise or not ((new.type='facture' and src.type='devis') or (new.type='avoir' and src.type='facture')) then raise exception 'Document source non valide';end if;
 elsif new.type='avoir' then raise exception 'Une facture source est requise';end if;
 if jsonb_typeof(new.lignes)<>'array' or jsonb_array_length(new.lignes) not between 1 and 50 then raise exception 'Lignes non valides';end if;
 new.total_ht:=0;new.total_taxe:=0;
 for l in select value from jsonb_array_elements(new.lignes) loop
  if jsonb_typeof(l)<>'object' or coalesce(char_length(trim(l->>'designation')),0) not between 1 and 500 or coalesce(l->>'quantite','') !~ '^[0-9]{1,7}([.][0-9]{1,4})?$' or coalesce(l->>'prix','') !~ '^[0-9]{1,12}([.][0-9]{1,2})?$' or coalesce(l->>'taxe','') !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' then raise exception 'Ligne non valide';end if;
  q:=(l->>'quantite')::numeric;p:=(l->>'prix')::numeric;t:=(l->>'taxe')::numeric;
  if q<=0 or t>100 then raise exception 'Quantité ou taxe non valide';end if;
  ht:=round(q*p,2);taxe:=round(ht*t/100,2);new.total_ht:=new.total_ht+ht;new.total_taxe:=new.total_taxe+taxe;
 end loop;
 new.total_ttc:=new.total_ht+new.total_taxe;
 if new.type='avoir' and new.total_ttc>src.total_ttc then raise exception 'Avoir supérieur au document source';end if;
 new.updated_at:=now();return new;
end;$$;
revoke all on function revictus_private.commercial_calcul() from public,anon,authenticated;
create trigger commercial_calcul before insert or update on public.commercial_documents for each row execute function revictus_private.commercial_calcul();
