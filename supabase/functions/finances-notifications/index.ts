// Fonction Edge : envoie les notifications push de Finances.
// Appelée chaque soir par la tâche planifiée « finances-notifications » (pg_cron),
// avec le secret partagé dans l'en-tête x-cron-secret. C'est la base qui vérifie
// ce secret : sans lui, aucune des fonctions SQL appelées ici ne répond.
//
// À déployer avec la vérification JWT désactivée (l'authentification se fait
// par le secret) : supabase functions deploy finances-notifications --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (requete: Request) => {
  const secret = requete.headers.get('x-cron-secret') ?? ''
  const base = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    db: { schema: 'finances' },
  })

  const { data: config, error: erreurConfig } = await base.rpc('config_push', { p_secret_cron: secret })
  if (erreurConfig) return reponse({ erreur: erreurConfig.message }, 500)
  if (!config) return reponse({ erreur: 'non autorise' }, 401)

  // Premier lancement : les clés d'envoi sont générées ici et rangées dans le coffre.
  let { publique, privee } = config as { publique: string | null; privee: string | null }
  if (!publique || !privee) {
    const cles = webpush.generateVAPIDKeys()
    const { error } = await base.rpc('enregistrer_cles_push', {
      p_secret_cron: secret,
      p_publique: cles.publicKey,
      p_privee: cles.privateKey,
    })
    if (error) return reponse({ erreur: error.message }, 500)
    publique = cles.publicKey
    privee = cles.privateKey
  }
  webpush.setVapidDetails('https://github.com/Yella90/finances-', publique, privee)

  const { data: messages, error: erreurMessages } = await base.rpc('preparer_notifications', {
    p_secret_cron: secret,
  })
  if (erreurMessages) return reponse({ erreur: erreurMessages.message }, 500)

  let envoyees = 0
  let echecs = 0
  for (const m of messages ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: m.point_acces, keys: { p256dh: m.cle_p256dh, auth: m.cle_auth } },
        JSON.stringify({ titre: m.titre, corps: m.corps, url: '/' }),
      )
      envoyees++
    } catch (e) {
      echecs++
      // 404 ou 410 : l'appareil s'est désabonné, on ne lui écrira plus.
      const statut = (e as { statusCode?: number }).statusCode
      if (statut === 404 || statut === 410) {
        await base.rpc('abonnement_expire', { p_secret_cron: secret, p_abonnement_id: m.abonnement_id })
      }
    }
  }

  return reponse({ envoyees, echecs })
})
