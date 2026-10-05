import { api } from './api';

// Browser (Web Push) notifications for the worker / incharge app.
//
// The chain: the service worker (public/sw.js) receives pushes and shows
// them; this module asks permission, creates the browser's PushSubscription
// with the server's VAPID public key, and registers it with the backend
// (/api/push/subscription), which sends poll alerts to it.

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; touch support gives it away.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Why notifications can't work here, or null when they can.
//   'insecure'       page not on https:// (browsers only allow push there, or on localhost)
//   'ios-install'    iPhone/iPad: only works after "Add to Home Screen"
//   'unsupported'    browser has no Web Push at all
export function pushUnavailableReason() {
  if (!window.isSecureContext) return 'insecure';
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!hasApis) return 'unsupported';
  return null;
}

export const notificationPermission = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

// The service worker is registered at startup (main.jsx). Waits for it to be
// active, with a timeout so a page whose worker failed to install doesn't
// hang the "Enable" button forever.
async function getRegistration() {
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('The app is still installing. Reload the page and try again.')), 10000)
  );
  return Promise.race([ready, timeout]);
}

export async function getCurrentSubscription() {
  if (pushUnavailableReason()) return null;
  try {
    const registration = await getRegistration();
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(subscription, keyBytes) {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return true; // browser doesn't expose it: assume it matches
  const a = new Uint8Array(current);
  return a.length === keyBytes.length && a.every((byte, i) => byte === keyBytes[i]);
}

let cachedPublicKey = null;
async function getPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  const result = await api.getPushPublicKey();
  if (!result.data?.enabled || !result.data.publicKey) return null;
  cachedPublicKey = result.data.publicKey;
  return cachedPublicKey;
}

// Creates (or reuses) this browser's subscription and saves it on the server.
// A subscription made with an older server key (the server's VAPID keys were
// changed) is replaced, since pushes signed with the new key can't reach it.
async function subscribeAndSave(publicKey) {
  const registration = await getRegistration();
  const keyBytes = urlBase64ToUint8Array(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, keyBytes)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
  }

  const json = subscription.toJSON();
  await api.savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return subscription;
}

// User tapped "Turn on notifications". Must run from that tap: browsers only
// show the permission prompt in response to a user gesture.
export async function enablePush() {
  const reason = pushUnavailableReason();
  if (reason) throw new Error(unavailableMessage(reason));

  const publicKey = await getPublicKey();
  if (!publicKey) throw new Error('Notifications are not set up on the server yet. Please tell your HR team.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
        : 'Notifications were not allowed.'
    );
  }

  return subscribeAndSave(publicKey);
}

// Called after sign-in and whenever the app opens with a signed-in user:
// if this browser already has permission, make sure its subscription exists
// and belongs to the current user. Silent — never prompts, never throws.
export async function syncPushSubscription() {
  try {
    if (pushUnavailableReason() || notificationPermission() !== 'granted') return false;
    const publicKey = await getPublicKey();
    if (!publicKey) return false;
    await subscribeAndSave(publicKey);
    return true;
  } catch {
    return false;
  }
}

// User tapped "Turn off" on this device.
export async function disablePush() {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;
  await api.deletePushSubscription(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

// On sign-out the server already deletes every subscription of the user;
// this stops the browser side too, so the next person signing in on this
// phone starts clean.
export async function unsubscribeLocally() {
  const subscription = await getCurrentSubscription();
  await subscription?.unsubscribe().catch(() => {});
}

export function unavailableMessage(reason) {
  switch (reason) {
    case 'insecure':
      return 'Notifications need the secure (https://) address of FlexiTrack. Ask your HR team for the https link.';
    case 'ios-install':
      return 'On iPhone, first add FlexiTrack to your Home Screen (Share → Add to Home Screen), then open it from there.';
    default:
      return 'This browser does not support notifications. Use Chrome on Android, or Safari on iPhone (from the Home Screen).';
  }
}
