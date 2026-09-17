const defaultTimerNotification = {
  title: "Rest complete",
  body: "Your next set is ready.",
  icon: "/fwb-home-icon-192.png",
  badge: "/favicon-32.png",
  tag: "fwb-rest-timer-complete",
  url: "/client-dashboard.html?tab=workouts"
};

function timerNotificationUrl(event) {
  if (!event?.data) {
    return defaultTimerNotification.url;
  }

  try {
    const value = event.data.json();
    return typeof value?.url === "string" ? value.url : defaultTimerNotification.url;
  } catch (error) {
    return defaultTimerNotification.url;
  }
}

function timerNotificationDestination(value) {
  const fallback = new URL(defaultTimerNotification.url, self.location.origin).href;

  try {
    const destination = new URL(value || defaultTimerNotification.url, self.location.origin);
    return destination.origin === self.location.origin ? destination.href : fallback;
  } catch (error) {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  const destination = timerNotificationDestination(timerNotificationUrl(event));

  event.waitUntil(self.registration.showNotification(defaultTimerNotification.title, {
    body: defaultTimerNotification.body,
    icon: defaultTimerNotification.icon,
    badge: defaultTimerNotification.badge,
    tag: defaultTimerNotification.tag,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: { url: destination }
  }));
});

self.addEventListener("notificationclick", (event) => {
  const destination = timerNotificationDestination(event.notification?.data?.url);

  event.notification?.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    const dashboard = windows.find((client) => client.url.includes("client-dashboard.html"));

    if (dashboard) {
      dashboard.postMessage({ type: "FWB_OPEN_WORKOUTS" });
      return dashboard.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
