/* Skidz Verify Server — src/security.js
 * Mêmes primitives que le protocole partagé : jeton de session signé et signature
 * HMAC du corps HTTP. Le relais n'a besoin d'aucune dépendance cryptographique externe.
 */
'use strict';

const crypto = require('node:crypto');

const RELAY_KIND = 'verify-relay';
const MAX_CLOCK_SKEW_SECONDS = 300;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function signToken(payload, secret, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, k: RELAY_KIND, exp: Math.floor(Date.now() / 1000) + (ttlSeconds || 900) })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function verifyToken(token, secret) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.k !== RELAY_KIND) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(String(timestamp) + '.' + String(body)).digest('hex');
}

function verifySignature(secret, timestamp, body, provided, nowSeconds) {
  const stamp = Number.parseInt(String(timestamp || ''), 10);
  if (!Number.isFinite(stamp)) return false;
  const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  if (Math.abs(now - stamp) > MAX_CLOCK_SKEW_SECONDS) return false;
  return safeEqual(signature(secret, stamp, body), String(provided || ''));
}

module.exports = { RELAY_KIND, MAX_CLOCK_SKEW_SECONDS, safeEqual, signToken, verifyToken, signature, verifySignature };
