// Service worker: recibe notificaciones push (Web Push) y abre la pantalla correcta al tocarlas.
// Importante (iOS): cada push DEBE mostrar una notificación, si no Safari revoca el permiso.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, ""); // "/sports-picks"

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Sports Picks", {
      body: data.body || "",
      icon: BASE + "/icon-192.png",
      badge: BASE + "/icon-192.png",
      tag: data.tag || undefined,
      data: data.data || {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || "/";
  const url = new URL(BASE + route, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin + BASE)) {
          if ("navigate" in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
