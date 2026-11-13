-- Comptes propres à Finances.
-- L'email et le mot de passe (haché) vivent dans finances.utilisateurs.
-- Plus aucun lien avec les comptes Supabase (auth.users), partagés avec liveshop.
--
-- Principe : la connexion renvoie un jeton de session. L'app l'envoie dans
-- l'en-tête « x-jeton-session » de chaque requête, et les règles de sécurité
-- retrouvent l'utilisateur à partir de ce jeton.

-- ---------------------------------------------------------------------------
-- utilisateurs : devient la seule source de vérité pour les comptes.
-- ---------------------------------------------------------------------------
alter table finances.utilisateurs drop constraint utilisateurs_id_fkey;
alter table finances.utilisateurs alter column id set default gen_random_uuid();
alter table finances.utilisateurs alter column email set not null;
alter table finances.utilisateurs
  add column mot_de_passe_hash       text not null,
  add column conditions_acceptees_le timestamptz,
  add column conditions_version      text,
  add column echecs_connexion        integer not null default 0,
  add column bloque_jusqua           timestamptz;

create unique index utilisateurs_email_unique on finances.utilisateurs (lower(email));

-- ---------------------------------------------------------------------------
-- sessions : un jeton par appareil connecté. Seule l'empreinte du jeton est
-- gardée : une fuite de cette table ne permet pas de se connecter.
-- Aucune règle d'accès : la table n'est lisible que par les fonctions ci-dessous.
-- ---------------------------------------------------------------------------
create table finances.sessions (
  jeton_hash     text primary key,
  utilisateur_id uuid not null references finances.utilisateurs (id) on delete cascade,
  cree_le        timestamptz not null default now(),
  expire_le      timestamptz not null
);
create index on finances.sessions (utilisateur_id);
alter table finances.sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Fonctions internes (non appelables depuis l'app).
-- ---------------------------------------------------------------------------
create function finances.empreinte_jeton(p_jeton text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_jeton, 'utf8')), 'hex');
$$;

create function finances.jeton_de_la_requete()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.headers', true), '')::json ->> 'x-jeton-session';
$$;

create function finances.ouvrir_session(p_utilisateur_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jeton text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from finances.sessions where utilisateur_id = p_utilisateur_id and expire_le < now();
  insert into finances.sessions (jeton_hash, utilisateur_id, expire_le)
  values (finances.empreinte_jeton(v_jeton), p_utilisateur_id, now() + interval '90 days');
  return v_jeton;
end;
$$;

create function finances.profil_json(p_utilisateur_id uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'id', u.id,
    'nom_complet', u.nom_complet,
    'email', u.email,
    'telephone', u.telephone,
    'devise', u.devise,
    'langue', u.langue,
    'notifications_actives', u.notifications_actives
  )
  from finances.utilisateurs u
  where u.id = p_utilisateur_id;
$$;

-- ---------------------------------------------------------------------------
-- Utilisateur de la requête en cours, d'après son jeton de session.
-- Utilisée par toutes les règles de sécurité.
-- ---------------------------------------------------------------------------
create function finances.id_utilisateur_courant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.utilisateur_id
  from finances.sessions s
  where s.jeton_hash = finances.empreinte_jeton(coalesce(finances.jeton_de_la_requete(), ''))
    and s.expire_le > now();
$$;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par l'app.
-- Les refus sont renvoyés dans le champ « erreur » plutôt que par une exception :
-- une exception annulerait aussi le comptage des tentatives ratées.
-- ---------------------------------------------------------------------------
create function finances.inscrire(
  p_email               text,
  p_mot_de_passe        text,
  p_nom_complet         text,
  p_telephone           text default null,
  p_devise              text default 'XOF',
  p_langue              text default 'fr',
  p_conditions_version  text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('erreur', 'EMAIL_INVALIDE');
  end if;
  if char_length(coalesce(p_mot_de_passe, '')) < 8 then
    return json_build_object('erreur', 'MOT_DE_PASSE_TROP_COURT');
  end if;
  if char_length(trim(coalesce(p_nom_complet, ''))) = 0 then
    return json_build_object('erreur', 'NOM_MANQUANT');
  end if;
  if p_conditions_version is null then
    return json_build_object('erreur', 'CONDITIONS_NON_ACCEPTEES');
  end if;
  if exists (select 1 from finances.utilisateurs where lower(email) = v_email) then
    return json_build_object('erreur', 'EMAIL_DEJA_UTILISE');
  end if;

  insert into finances.utilisateurs (
    nom_complet, email, telephone, devise, langue,
    mot_de_passe_hash, conditions_acceptees_le, conditions_version
  )
  values (
    trim(p_nom_complet), v_email, nullif(trim(coalesce(p_telephone, '')), ''),
    coalesce(p_devise, 'XOF'), coalesce(p_langue, 'fr'),
    extensions.crypt(p_mot_de_passe, extensions.gen_salt('bf', 10)), now(), p_conditions_version
  )
  returning id into v_id;

  return json_build_object(
    'jeton', finances.ouvrir_session(v_id),
    'utilisateur', finances.profil_json(v_id)
  );
exception
  when unique_violation then
    return json_build_object('erreur', 'EMAIL_DEJA_UTILISE');
  when check_violation then
    return json_build_object('erreur', 'DEVISE_OU_LANGUE_INVALIDE');
end;
$$;

create function finances.connecter(p_email text, p_mot_de_passe text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utilisateur finances.utilisateurs%rowtype;
  v_echecs      integer;
begin
  select * into v_utilisateur
  from finances.utilisateurs
  where lower(email) = lower(trim(p_email))
  for update;

  if not found then
    -- Même temps de calcul que pour un compte existant, pour ne pas révéler
    -- quels emails sont inscrits.
    perform extensions.crypt(coalesce(p_mot_de_passe, ''), extensions.gen_salt('bf', 10));
    return json_build_object('erreur', 'IDENTIFIANTS_INVALIDES');
  end if;

  if v_utilisateur.bloque_jusqua is not null and v_utilisateur.bloque_jusqua > now() then
    return json_build_object('erreur', 'COMPTE_BLOQUE');
  end if;

  if v_utilisateur.mot_de_passe_hash
     <> extensions.crypt(coalesce(p_mot_de_passe, ''), v_utilisateur.mot_de_passe_hash) then
    -- Après 5 erreurs de suite, le compte est bloqué 15 minutes.
    v_echecs := v_utilisateur.echecs_connexion + 1;
    update finances.utilisateurs
    set echecs_connexion = case when v_echecs >= 5 then 0 else v_echecs end,
        bloque_jusqua    = case when v_echecs >= 5 then now() + interval '15 minutes' else null end
    where id = v_utilisateur.id;
    return json_build_object('erreur', 'IDENTIFIANTS_INVALIDES');
  end if;

  update finances.utilisateurs
  set echecs_connexion = 0, bloque_jusqua = null
  where id = v_utilisateur.id;

  return json_build_object(
    'jeton', finances.ouvrir_session(v_utilisateur.id),
    'utilisateur', finances.profil_json(v_utilisateur.id)
  );
end;
$$;

create function finances.deconnecter()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from finances.sessions
  where jeton_hash = finances.empreinte_jeton(coalesce(finances.jeton_de_la_requete(), ''));
$$;

-- Profil de la session en cours, ou null si le jeton n'est plus valable.
create function finances.mon_profil()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select finances.profil_json(finances.id_utilisateur_courant());
$$;

-- ---------------------------------------------------------------------------
-- Les modifications de date ne doivent pas toucher aux champs de sécurité :
-- le déclencheur existant ne fait que mettre à jour modifie_le, rien à changer.
--
-- Règles de sécurité : remplacées pour s'appuyer sur le jeton de session.
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
    execute format('drop policy proprietaire on finances.%I', t);
    execute format(
      'create policy proprietaire on finances.%I for all to anon
         using ((select finances.id_utilisateur_courant()) = utilisateur_id)
         with check ((select finances.id_utilisateur_courant()) = utilisateur_id)', t);
    execute format(
      'alter table finances.%I alter column utilisateur_id set default finances.id_utilisateur_courant()', t);
  end loop;
end;
$$;

drop policy proprietaire on finances.utilisateurs;
create policy proprietaire on finances.utilisateurs for all to anon
  using ((select finances.id_utilisateur_courant()) = id)
  with check ((select finances.id_utilisateur_courant()) = id);

-- ---------------------------------------------------------------------------
-- Droits.
-- L'app parle à la base avec le rôle « anon » : c'est le jeton de session,
-- vérifié par les règles ci-dessus, qui identifie l'utilisateur.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema finances from authenticated, anon;
revoke all on schema finances from authenticated;
grant usage on schema finances to anon;

grant select, insert, update on
  finances.comptes, finances.sources_revenu, finances.categories,
  finances.objectifs_epargne, finances.projets, finances.lignes_budget,
  finances.regles_recurrentes, finances.transactions, finances.abonnements_notifications
to anon;

-- Sur utilisateurs : jamais d'accès au mot de passe haché ni aux compteurs,
-- et seuls quelques champs du profil sont modifiables. La création passe par inscrire().
grant select (id, nom_complet, email, telephone, devise, langue, notifications_actives, cree_le, modifie_le)
  on finances.utilisateurs to anon;
grant update (nom_complet, telephone, langue, notifications_actives)
  on finances.utilisateurs to anon;

revoke execute on all functions in schema finances from public, anon, authenticated;
grant execute on function
  finances.inscrire(text, text, text, text, text, text, text),
  finances.connecter(text, text),
  finances.deconnecter(),
  finances.mon_profil(),
  finances.id_utilisateur_courant()
to anon;
