// Le service worker de la version téléphone : la page s'ouvre même sans réseau, avec le dernier envoi du PC (gardé
// chiffré, tel qu'il a été reçu). Réseau d'abord pour tout (la page et les données sont toujours les plus fraîches
// quand il y a du réseau), la copie gardée sinon.
const CACHE = 'tableau-telephone-1';
const COQUILLE = ['./', './index.html', './style.css', './appli.js', './calcul.js', './manifest.webmanifest', './icone.svg', './icone-192.png'];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(COQUILLE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  const adresse = new URL(requete.url);
  if (requete.method !== 'GET' || adresse.origin !== self.location.origin) return;
  const donnees = adresse.pathname.endsWith('/donnees.json');
  // Les données : une seule copie gardée, sans le « ?t= » qui ne sert qu'à passer les caches.
  const cle = donnees ? new URL('donnees.json', self.registration.scope).href : requete;
  evenement.respondWith(
    fetch(requete, { cache: donnees ? 'no-store' : 'no-cache' })
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(cle, copie));
        }
        return reponse;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        const garde = await cache.match(cle, { ignoreSearch: !donnees });
        if (garde) return garde;
        if (requete.mode === 'navigate') return (await cache.match('./index.html')) ?? Response.error();
        return Response.error();
      }),
  );
});
