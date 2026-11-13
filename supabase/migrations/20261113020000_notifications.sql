-- Notifications push.
--
-- Fonctionnement :
--   1. L'app abonne l'appareil et enregistre l'abonnement dans abonnements_notifications.
--   2. Chaque soir, une tâche planifiée appelle la fonction Edge « finances-notifications ».
--   3. Cette fonction demande à la base quoi envoyer, puis pousse les messages.
--
-- Les secrets (clé privée d'envoi, secret de la tâche planifiée) sont dans le
-- coffre Supabase (Vault). Ils sont générés côté serveur et ne figurent dans
-- aucun fichier du dépôt.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Une ligne par notification déjà envoyée, pour ne pas répéter le même message.
create table finances.notifications_envoyees (
  utilisateur_id uuid not null references finances.utilisateurs (id) on delete cascade,
  cle            text not null,
  envoyee_le     timestamptz not null default now(),
  primary key (utilisateur_id, cle)
);
alter table finances.notifications_envoyees enable row level security;

-- Secret partagé entre la tâche planifiée et la fonction Edge.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'finances_cron_secret',
  'Secret de la tâche planifiée des notifications Finances'
)
where not exists (select 1 from vault.secrets where name = 'finances_cron_secret');

-- Lecture d'un secret du coffre (interne).
create function finances.secret(p_nom text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nom;
$$;

create function finances.secret_cron_valide(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and p_secret = finances.secret('finances_cron_secret');
$$;

-- Clé publique d'abonnement, lue par l'app. Null tant que les clés n'existent pas.
create function finances.cle_push_publique()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select finances.secret('finances_vapid_publique');
$$;

-- Les fonctions suivantes sont réservées à la fonction Edge : elles exigent
-- le secret de la tâche planifiée.

create function finances.config_push(p_secret_cron text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not finances.secret_cron_valide(p_secret_cron) then
    return null;
  end if;
  return json_build_object(
    'publique', finances.secret('finances_vapid_publique'),
    'privee', finances.secret('finances_vapid_privee')
  );
end;
$$;

create function finances.enregistrer_cles_push(p_secret_cron text, p_publique text, p_privee text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not finances.secret_cron_valide(p_secret_cron) then
    raise exception 'non autorise';
  end if;
  -- Les clés ne sont créées qu'une fois : les changer invaliderait tous les abonnements.
  if finances.secret('finances_vapid_privee') is not null then
    return;
  end if;
  perform vault.create_secret(p_publique, 'finances_vapid_publique', 'Clé publique des notifications Finances');
  perform vault.create_secret(p_privee, 'finances_vapid_privee', 'Clé privée des notifications Finances');
end;
$$;

-- Liste les messages à envoyer maintenant et les marque comme envoyés.
-- Pour l'instant : un rappel aux personnes qui n'ont rien saisi depuis 3 jours,
-- au plus une fois tous les 3 jours.
create function finances.preparer_notifications(p_secret_cron text)
returns table (
  abonnement_id uuid,
  point_acces   text,
  cle_p256dh    text,
  cle_auth      text,
  titre         text,
  corps         text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not finances.secret_cron_valide(p_secret_cron) then
    raise exception 'non autorise';
  end if;

  return query
  with cibles as (
    select u.id
    from finances.utilisateurs u
    where u.notifications_actives
      and exists (
        select 1 from finances.abonnements_notifications a
        where a.utilisateur_id = u.id and a.supprime_le is null
      )
      and not exists (
        select 1 from finances.transactions t
        where t.utilisateur_id = u.id and t.cree_le > now() - interval '3 days'
      )
      and not exists (
        select 1 from finances.notifications_envoyees n
        where n.utilisateur_id = u.id
          and n.cle like 'rappel:%'
          and n.envoyee_le > now() - interval '3 days'
      )
  ),
  marquees as (
    insert into finances.notifications_envoyees (utilisateur_id, cle)
    select c.id, 'rappel:' || current_date from cibles c
    on conflict do nothing
    returning utilisateur_id
  )
  select a.id, a.point_acces, a.cle_p256dh, a.cle_auth,
         'Finances'::text,
         'Vous n''avez rien noté depuis 3 jours. Pensez à saisir vos dépenses.'::text
  from finances.abonnements_notifications a
  join marquees m on m.utilisateur_id = a.utilisateur_id
  where a.supprime_le is null;
end;
$$;

-- Un abonnement refusé par le navigateur (appareil désinscrit) est désactivé.
create function finances.abonnement_expire(p_secret_cron text, p_abonnement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not finances.secret_cron_valide(p_secret_cron) then
    raise exception 'non autorise';
  end if;
  update finances.abonnements_notifications set supprime_le = now() where id = p_abonnement_id;
end;
$$;

-- Droits.
revoke execute on function
  finances.secret(text),
  finances.secret_cron_valide(text),
  finances.cle_push_publique(),
  finances.config_push(text),
  finances.enregistrer_cles_push(text, text, text),
  finances.preparer_notifications(text),
  finances.abonnement_expire(text, uuid)
from public, anon, authenticated;

grant execute on function finances.cle_push_publique() to anon;

grant usage on schema finances to service_role;
grant execute on function
  finances.config_push(text),
  finances.enregistrer_cles_push(text, text, text),
  finances.preparer_notifications(text),
  finances.abonnement_expire(text, uuid)
to service_role;

-- Tâche quotidienne à 19 h UTC (19 h à Bamako).
select cron.schedule(
  'finances-notifications',
  '0 19 * * *',
  $tache$
  select net.http_post(
    url := 'https://duilcacabsfokrxuvmjm.supabase.co/functions/v1/finances-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'finances_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $tache$
);
