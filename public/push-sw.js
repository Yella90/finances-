// Partie « notifications » du service worker, chargée par celui que génère la PWA.

// Message poussé par le serveur : { titre, corps, url }.
self.addEventListener('push', (evenement) => {
  let message = { titre: 'Finances', corps: '', url: '/' }
  try {
    if (evenement.data) message = { ...message, ...evenement.data.json() }
  } catch {
    if (evenement.data) message.corps = evenement.data.text()
  }
  evenement.waitUntil(
    self.registration.showNotification(message.titre, {
      body: message.corps,
      icon: '/icone.svg',
      badge: '/icone.svg',
      data: { url: message.url },
    }),
  )
})

// Un appui sur la notification ramène sur l'app, ou l'ouvre.
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close()
  const url = (evenement.notification.data && evenement.notification.data.url) || '/'
  evenement.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ('focus' in f) return f.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
