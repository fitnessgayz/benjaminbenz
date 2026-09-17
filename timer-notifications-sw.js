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
    if (typeof value?.data?.url === "string") {
      return value.data.url;
    }
    return typeof value?.url === "string" ? value.url : defaultTimerNotification.url;
  } catch (error) {
    return defaultTimerNotification.url;
  }
}

function timerNotificationContent(event) {
  let value = null;
  try {
    value = event?.data?.json?.() || null;
  } catch (error) {
    value = null;
  }

  const safeText = (candidate, fallback, maximumLength) => {
    const text = typeof candidate === "string" ? candidate.trim() : "";
    return (text || fallback).slice(0, maximumLength);
  };

  return {
    title: safeText(value?.title, defaultTimerNotification.title, 160),
    body: safeText(value?.body, defaultTimerNotification.body, 500),
    icon: typeof value?.icon === "string" && value.icon.startsWith("/") && !value.icon.startsWith("//")
      ? value.icon
      : defaultTimerNotification.icon,
    badge: typeof value?.badge === "string" && value.badge.startsWith("/") && !value.badge.startsWith("//")
      ? value.badge
      : defaultTimerNotification.badge,
    tag: safeText(value?.tag, defaultTimerNotification.tag, 300),
    url: timerNotificationDestination(timerNotificationUrl(event)),
    notificationId: safeText(value?.data?.notificationId, "", 100)
  };
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
  const content = timerNotificationContent(event);

  event.waitUntil(self.registration.showNotification(content.title, {
    body: content.body,
    icon: content.icon,
    badge: content.badge,
    tag: content.tag,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: content.url,
      notificationId: content.notificationId
    }
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
    const destinationUrl = new URL(destination);
    const dashboard = windows.find((client) => {
      try {
        return new URL(client.url).pathname === destinationUrl.pathname;
      } catch (error) {
        return false;
      }
    });

    if (dashboard) {
      if (
        destinationUrl.pathname.endsWith("/client-dashboard.html") &&
        destinationUrl.searchParams.get("tab") === "workouts"
      ) {
        dashboard.postMessage({ type: "FWB_OPEN_WORKOUTS" });
      } else if (typeof dashboard.navigate === "function") {
        await dashboard.navigate(destination);
      }
      return dashboard.focus();
    }
    return self.clients.openWindow(destination);
  })());
});
