/* Service worker: shows step alerts. Pushes arrive empty; the text comes from /api/push's inbox. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch("/api/push?inbox=1&endpoint=" + encodeURIComponent(sub.endpoint), { cache: "no-store" });
        items = (await r.json()).items || [];
      }
    } catch (err) {}
    if (!items.length) items = [{ title: "Game Plan", body: "Time for the next step.", tag: "rgp" }];
    for (const it of items) {
      await self.registration.showNotification(it.title, {
        body: it.body, tag: it.tag, renotify: true,
        icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
        vibrate: [250, 120, 250, 120, 250], data: { url: "/" }
      });
    }
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { c.postMessage({ type: "rgp-now" }); return c.focus(); } }
    return self.clients.openWindow("/?now=1");
  })());
});
