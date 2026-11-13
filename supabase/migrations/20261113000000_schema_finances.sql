-- Schéma « finances » : application de gestion financière personnelle.
-- Hébergé dans le projet Supabase « liveshop », isolé du schéma public.
-- Ce script ne touche ni au schéma public ni au schéma auth.

create schema if not exists finances;

-- ---------------------------------------------------------------------------
-- Fonction commune : met à jour « modifie_le » à chaque écriture.
-- La date vient du serveur : elle sert de curseur pour la synchronisation
-- (« donne-moi tout ce qui a changé depuis ma dernière synchro »).
-- ---------------------------------------------------------------------------
create or replace function finances.maj_modifie_le()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modifie_le = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- utilisateurs : profil créé à l'inscription (une ligne par compte auth).
-- La devise et la langue sont choisies à la création du compte.
-- ---------------------------------------------------------------------------
create table finances.utilisateurs (
  id                    uuid primary key references auth.users (id) on delete cascade,
  nom_complet           text not null,
  email                 text,
  telephone             text,
  devise                text not null default 'XOF' check (devise ~ '^[A-Z]{3}$'),
  langue                text not null default 'fr' check (langue in ('fr', 'bm')),
  notifications_actives boolean not null default true,
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- comptes : là où se trouve l'argent (espèces, Orange Money, banque...).
-- ---------------------------------------------------------------------------
create table finances.comptes (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  nom            text not null,
  type           text not null check (type in ('especes', 'mobile_money', 'banque', 'autre')),
  solde_initial  numeric(14, 2) not null default 0,
  archive        boolean not null default false,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz
);

-- ---------------------------------------------------------------------------
-- sources_revenu : salaire, commerce, transferts reçus, etc.
-- ---------------------------------------------------------------------------
create table finances.sources_revenu (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  nom            text not null,
  type           text not null check (type in ('salaire', 'commerce', 'freelance', 'agriculture', 'transfert_recu', 'tontine', 'autre')),
  montant_prevu  numeric(14, 2) check (montant_prevu >= 0),
  frequence      text not null default 'mensuel' check (frequence in ('ponctuel', 'hebdomadaire', 'mensuel', 'annuel', 'irregulier')),
  compte_id      uuid references finances.comptes (id) on delete set null,
  actif          boolean not null default true,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz
);

-- ---------------------------------------------------------------------------
-- categories : catégories de dépenses, personnalisables par l'utilisateur.
-- ---------------------------------------------------------------------------
create table finances.categories (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  nom            text not null,
  icone          text,
  couleur        text,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz
);

-- ---------------------------------------------------------------------------
-- objectifs_epargne : montant cible à atteindre pour une date donnée.
-- La progression se calcule à partir des transactions de type « epargne ».
-- ---------------------------------------------------------------------------
create table finances.objectifs_epargne (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  nom            text not null,
  montant_cible  numeric(14, 2) not null check (montant_cible > 0),
  date_cible     date,
  icone          text,
  statut         text not null default 'en_cours' check (statut in ('en_cours', 'atteint', 'abandonne')),
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz
);

-- ---------------------------------------------------------------------------
-- projets et lignes_budget : une enveloppe par projet, découpée en postes.
-- ---------------------------------------------------------------------------
create table finances.projets (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  nom            text not null,
  description    text,
  budget_total   numeric(14, 2) not null default 0 check (budget_total >= 0),
  date_debut     date,
  date_fin       date,
  statut         text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'suspendu')),
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz
);

create table finances.lignes_budget (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  projet_id      uuid not null references finances.projets (id) on delete cascade,
  nom            text not null,
  montant_prevu  numeric(14, 2) not null check (montant_prevu >= 0),
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz
);

-- ---------------------------------------------------------------------------
-- regles_recurrentes : loyer, abonnements, salaire... générés automatiquement.
-- ---------------------------------------------------------------------------
create table finances.regles_recurrentes (
  id               uuid primary key default gen_random_uuid(),
  utilisateur_id   uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  libelle          text not null,
  type             text not null check (type in ('revenu', 'depense')),
  montant          numeric(14, 2) not null check (montant > 0),
  frequence        text not null check (frequence in ('hebdomadaire', 'mensuel', 'annuel')),
  prochaine_date   date not null,
  compte_id        uuid references finances.comptes (id) on delete set null,
  categorie_id     uuid references finances.categories (id) on delete set null,
  source_revenu_id uuid references finances.sources_revenu (id) on delete set null,
  actif            boolean not null default true,
  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz not null default now(),
  supprime_le      timestamptz
);

-- ---------------------------------------------------------------------------
-- transactions : tout mouvement d'argent.
--   revenu    : argent qui entre sur compte_id
--   depense   : argent qui sort de compte_id
--   transfert : de compte_id vers compte_destination_id
--   epargne   : versement de compte_id vers un objectif d'épargne
-- ---------------------------------------------------------------------------
create table finances.transactions (
  id                    uuid primary key default gen_random_uuid(),
  utilisateur_id        uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  type                  text not null check (type in ('revenu', 'depense', 'transfert', 'epargne')),
  montant               numeric(14, 2) not null check (montant > 0),
  date_operation        date not null default current_date,
  compte_id             uuid not null references finances.comptes (id) on delete restrict,
  compte_destination_id uuid references finances.comptes (id) on delete restrict,
  categorie_id          uuid references finances.categories (id) on delete set null,
  source_revenu_id      uuid references finances.sources_revenu (id) on delete set null,
  projet_id             uuid references finances.projets (id) on delete set null,
  ligne_budget_id       uuid references finances.lignes_budget (id) on delete set null,
  objectif_id           uuid references finances.objectifs_epargne (id) on delete set null,
  regle_recurrente_id   uuid references finances.regles_recurrentes (id) on delete set null,
  note                  text,
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now(),
  supprime_le           timestamptz,
  constraint transfert_a_une_destination check (
    (type = 'transfert' and compte_destination_id is not null and compte_destination_id <> compte_id)
    or (type <> 'transfert' and compte_destination_id is null)
  ),
  constraint epargne_a_un_objectif check (type <> 'epargne' or objectif_id is not null)
);

-- ---------------------------------------------------------------------------
-- abonnements_notifications : un appareil inscrit aux notifications push.
-- ---------------------------------------------------------------------------
create table finances.abonnements_notifications (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references finances.utilisateurs (id) on delete cascade,
  point_acces    text not null,
  cle_p256dh     text not null,
  cle_auth       text not null,
  appareil       text,
  cree_le        timestamptz not null default now(),
  modifie_le     timestamptz not null default now(),
  supprime_le    timestamptz,
  unique (utilisateur_id, point_acces)
);

-- ---------------------------------------------------------------------------
-- Index : synchronisation (par utilisateur et date de modification)
-- et affichage des transactions par date.
-- ---------------------------------------------------------------------------
create index on finances.transactions (utilisateur_id, date_operation desc);
create index on finances.transactions (projet_id) where projet_id is not null;
create index on finances.transactions (objectif_id) where objectif_id is not null;
create index on finances.lignes_budget (projet_id);

-- ---------------------------------------------------------------------------
-- Pour chaque table de données : index de synchro, déclencheur modifie_le,
-- sécurité par ligne (chacun ne voit et ne modifie que ses propres lignes).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'comptes', 'sources_revenu', 'categories', 'objectifs_epargne', 'projets',
    'lignes_budget', 'regles_recurrentes', 'transactions', 'abonnements_notifications'
  ]
  loop
    execute format('create index on finances.%I (utilisateur_id, modifie_le)', t);
    execute format(
      'create trigger maj_modifie_le before insert or update on finances.%I
         for each row execute function finances.maj_modifie_le()', t);
    execute format('alter table finances.%I enable row level security', t);
    execute format(
      'create policy proprietaire on finances.%I for all to authenticated
         using ((select auth.uid()) = utilisateur_id)
         with check ((select auth.uid()) = utilisateur_id)', t);
  end loop;
end;
$$;

create trigger maj_modifie_le before insert or update on finances.utilisateurs
  for each row execute function finances.maj_modifie_le();

alter table finances.utilisateurs enable row level security;

create policy proprietaire on finances.utilisateurs for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Droits : uniquement les utilisateurs connectés. Aucun accès anonyme.
-- Pas de droit « delete » : les suppressions passent par « supprime_le »,
-- sinon la synchronisation hors ligne ne peut pas les propager.
-- ---------------------------------------------------------------------------
revoke all on schema finances from anon, public;
grant usage on schema finances to authenticated;
grant select, insert, update on all tables in schema finances to authenticated;
