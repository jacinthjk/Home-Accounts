/* Home Accounts – offline support.
   Keeps a copy of the app's own files so it opens without internet.
   It never stores or sees your accounts: those are encrypted in the browser's storage, not in this cache.
   Change VERSION whenever the app files change, so phones pick up the new version. */
const VERSION = 'home-accounts-v14';
const REMINDER_CACHE = 'home-accounts-reminder', REMINDER_FILE = './reminder.json'; // on/off, time and wording only: no accounts
const FILES = [
  './', './index.html', './config.js', './app.js', './i18n.js', './styles.css', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== REMINDER_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Show the saved copy straight away (works offline), and refresh it in the background.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  }));
});

// Daily reminder, at most once a day. It only knows the date and the wording: the accounts stay locked.
async function checkReminder(alreadyNoted) {
  const cache = await caches.open(REMINDER_CACHE);
  const res = await cache.match(REMINDER_FILE);
  if (!res) return;
  const c = await res.json();
  const now = new Date(), today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (!c.on || c.last === today || now.getHours() < c.hour) return;
  await cache.put(REMINDER_FILE, new Response(JSON.stringify({ ...c, last: today })));
  if (alreadyNoted && now.getDate() !== 1) return;
  await self.registration.showNotification(c.title, { body: now.getDate() === 1 ? c.monthBody : c.body, icon: 'icons/icon-192.png', tag: 'daily-reminder' });
}
self.addEventListener('periodicsync', e => { if (e.tag === 'daily-reminder') e.waitUntil(checkReminder(false)); });
self.addEventListener('message', e => { if (e.data?.type === 'reminder-check') e.waitUntil(checkReminder(e.data.done)); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
