importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const CACHE = 'mindfree-v13';
const FILES = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyBzk9byhN_QYgp5zY7mq6aRodTSLG3NnIM",
  authDomain: "mindfree-b0d05.firebaseapp.com",
  projectId: "mindfree-b0d05",
  storageBucket: "mindfree-b0d05.firebasestorage.app",
  messagingSenderId: "734963657032",
  appId: "1:734963657032:web:eee23fa7f7ff841fe16b7d"
});

const messaging = firebase.messaging();

// Handle background FCM messages
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || '🔔 MindFree';
  const body = payload.notification?.body || 'Rappel';
  return self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data
  });
});

// Cache install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network first
self.addEventListener('fetch', e => {
  if(e.request.url.includes('firebasejs')) return; // ne pas cacher Firebase
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Scheduled notifications via postMessage
const _scheduled = new Map();

self.addEventListener('message', e => {
  if(e.data?.type === 'SCHEDULE_NOTIF') {
    const { title, time, key } = e.data;
    const delay = time - Date.now();
    if(delay <= 0 || delay > 86400000 * 30) return;
    // Clear existing for same key
    if(_scheduled.has(key)) clearTimeout(_scheduled.get(key));
    const tid = setTimeout(() => {
      self.registration.showNotification('🔔 MindFree', {
        body: title,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        tag: key,
        renotify: true
      });
      _scheduled.delete(key);
    }, Math.min(delay, 2147483647));
    _scheduled.set(key, tid);
  }
});
