// Ad ogni aggiornamento dell'app aumenta il numero qui sotto
const CACHE = 'lavori-v4';
const FILES = ['./', 'index.html', 'style.css', 'logica.js', 'app.js', 'firebase-config.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

// 🔔 Notifiche: Firebase mostra da solo le notifiche che arrivano con l'app chiusa
importScripts('firebase-config.js');
if (self.FIREBASE_CONFIG && self.FIREBASE_CONFIG.apiKey) {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(self.FIREBASE_CONFIG);
  firebase.messaging();
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // foglio Google e Firebase passano sempre dalla rete
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
