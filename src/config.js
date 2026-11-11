/* Skidz Verify Server — src/config.js
 * Configuration du relais public. Validation stricte : une URL publique, un backend
 * joignable et un secret partagé sont nécessaires avant d'ouvrir le port.
 */
'use strict';

const path = require('node:path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
} catch (_) {
  /* Render injecte les variables directement. */
}

function read(env, name, fallback) {
  const value = env[name];
  return value === undefined || value === '' ? fallback || '' : String(value).trim();
}

function integer(env, name, fallback) {
  const value = Number.parseInt(env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function loadConfig(env) {
  const source = env || process.env;
  const renderHost = read(source, 'RENDER_EXTERNAL_HOSTNAME');
  const publicUrl = (read(source, 'PUBLIC_URL') || read(source, 'RENDER_EXTERNAL_URL') || (renderHost ? 'https://' + renderHost : '')).replace(/\/+$/, '');
  const backendUrl = read(source, 'BACKEND_URL').replace(/\/+$/, '');
  const relaySecret = read(source, 'RELAY_SECRET');

  if (!publicUrl) throw new Error('PUBLIC_URL missing and Render did not provide RENDER_EXTERNAL_URL/RENDER_EXTERNAL_HOSTNAME.');
  if (!backendUrl) throw new Error('BACKEND_URL missing (the Verify backend base URL).');
  for (const [name, value] of [['PUBLIC_URL', publicUrl], ['BACKEND_URL', backendUrl]]) {
    if (!/^https:\/\//i.test(value) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) {
      throw new Error(name + ' must be https:// (http:// is only tolerated for localhost).');
    }
  }
  if (relaySecret.length < 32) throw new Error('RELAY_SECRET missing or too short (32 characters minimum).');

  return {
    publicUrl,
    backendUrl,
    relaySecret,
    port: integer(source, 'PORT', 10000),
    host: read(source, 'HOST', '0.0.0.0'),
    trustProxyHops: Math.max(0, integer(source, 'TRUST_PROXY_HOPS', 1)),
    backendTimeoutMs: Math.max(2000, integer(source, 'BACKEND_TIMEOUT_MS', 12000)),
    stunServer: read(source, 'STUN_SERVER'),
    botName: read(source, 'BOT_NAME', 'Skidz Verify'),
    ipRetentionDays: Math.max(1, integer(source, 'IP_RETENTION_DAYS', 30)),
    deviceRetentionDays: Math.max(1, integer(source, 'DEVICE_RETENTION_DAYS', 180)),
    logRetentionDays: Math.max(1, integer(source, 'LOG_RETENTION_DAYS', 90)),
  };
}

module.exports = { loadConfig };
