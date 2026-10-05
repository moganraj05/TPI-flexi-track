const webpush = require('web-push');
const logger = require('../utils/logger');

// Web Push (browser / installed web app notifications) is signed with a
// VAPID key pair that identifies this server to the browsers' push services
// (Google FCM, Mozilla, Apple). Generate one pair once per deployment with
// `npm run push:vapid-keys` and keep it stable: rotating the keys silently
// orphans every existing browser subscription (each browser re-subscribes
// the next time its user opens the app, see webfrontend src/mobile/push.js).
//
// When the keys are missing, web push is simply off: the public-key endpoint
// reports it, the web app hides its "Enable notifications" button, and
// sending skips browsers. The Expo (APK) channel is unaffected either way.

let configured = null;

function readConfig() {
  const publicKey = (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
  // Push services require a contact for the sender: a mailto: or https: URL.
  const subject = (process.env.WEB_PUSH_SUBJECT || 'mailto:admin@example.com').trim();
  return { publicKey, privateKey, subject };
}

function isWebPushConfigured() {
  if (configured !== null) return configured;

  const { publicKey, privateKey, subject } = readConfig();
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    // Malformed keys or subject: log once and run with web push disabled
    // rather than failing every notification send at runtime.
    logger.error('push.web_config_invalid', { error: error.message });
    configured = false;
  }
  return configured;
}

function getVapidPublicKey() {
  return isWebPushConfigured() ? readConfig().publicKey : null;
}

module.exports = { webpush, isWebPushConfigured, getVapidPublicKey };
