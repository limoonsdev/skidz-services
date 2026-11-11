/* Skidz Verify Server — src/server.js
 * Relais public Render :
 *   GET  /v/<jeton>   page de contrôle (le jeton vient du backend, signé)
 *   POST /v/<jeton>   valide consentement, captcha, preuve de travail, puis envoie
 *                      le rapport navigateur signé au backend
 *   GET  /callback    retour OAuth2 : transmet code + state au backend et rend sa page
 *   GET  /t/<jeton>   ping de latence local (aucun backend sollicité)
 *   GET  /privacy · /health · /
 * Le relais ne décide jamais : le backend garde la base, les contrôles réseau et Discord.
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const pages = require('./pages');
const captcha = require('./captcha');
const { verifyPow } = require('./pow');
const { verifyToken, signature } = require('./security');

const TOKEN_PATH = /^\/v\/([A-Za-z0-9_.-]{20,1200})$/;
const PING_PATH = /^\/t\/([A-Za-z0-9_.-]{20,1200})$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const FORM_LIMIT = 96 * 1024;
const COOKIE_NAME = 'nm_did';

const newDeviceId = () => crypto.randomBytes(18).toString('base64url');

function readCookie(req, name) {
  for (const part of String((req.headers && req.headers.cookie) || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      const value = rest.join('=');
      return DEVICE_ID.test(value) ? value : null;
    }
  }
  return null;
}

function deviceCookie(name, value, secure) {
  return name + '=' + value + '; Path=/; Max-Age=' + 400 * 86400 + '; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
}

function clientIp(req, config) {
  if (config.trustProxyHops > 0 && req.headers['x-forwarded-for']) {
    const chain = String(req.headers['x-forwarded-for']).split(',').map((part) => part.trim()).filter(Boolean);
    const index = chain.length - config.trustProxyHops;
    return chain[index >= 0 ? index : 0] || req.socket.remoteAddress || '';
  }
  return req.socket.remoteAddress || '';
}

function readForm(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit * 8) {
        req.destroy();
        return;
      }
      if (exceeded) return;
      if (size > limit) {
        exceeded = true;
        chunks.length = 0;
        reject(new Error('request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

/** Seuls les en-têtes utiles au backend sont relayés ; le cookie reste un identifiant opaque. */
function forwardedHeaders(req, ip) {
  const names = [
    'user-agent', 'accept', 'accept-language', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
    'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user', 'upgrade-insecure-requests', 'dnt',
  ];
  const out = { 'x-forwarded-for': ip, 'x-real-ip': ip };
  for (const name of names) if (req.headers[name] !== undefined) out[name] = String(req.headers[name]);
  return out;
}

function createRelayServer(config, deps) {
  const options = deps || {};
  const fetchImpl = options.fetchImpl || fetch;
  const secure = /^https:/i.test(config.publicUrl);
  const assetRoot = path.join(__dirname, '..', '..');
  const loadAsset = (name) => {
    try {
      return fs.readFileSync(path.join(assetRoot, name));
    } catch (_) {
      return null;
    }
  };
  const assets = { banner: loadAsset('banner.png'), logo: loadAsset('logo.png') };
  const fonts = {
    'inter-400.ttf': loadAsset('SkidzEmojis/assets/fonts/Inter_400Regular.ttf'),
    'inter-600.ttf': loadAsset('SkidzEmojis/assets/fonts/Inter_600SemiBold.ttf'),
    'inter-800.ttf': loadAsset('SkidzEmojis/assets/fonts/Inter_800ExtraBold.ttf'),
  };
  pages.setAssets({ banner: assets.banner ? '/assets/banner.png' : null, logo: assets.logo ? '/assets/logo.png' : null, brand: config.botName });

  function send(res, status, body, extra) {
    const isPage = body && typeof body === 'object' && body.html;
    const headers = {
      'Content-Type': isPage || typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Strict-Transport-Security': 'max-age=15552000',
      ...extra,
    };
    if (isPage) headers['Content-Security-Policy'] = body.csp;
    res.writeHead(status, headers);
    res.end(isPage ? body.html : typeof body === 'string' ? body : JSON.stringify(body));
  }

  const errorPage = (title, message) => pages.resultPage('error', title, message);
  const expired = () => errorPage('Invalid or expired link', 'Go back to Discord and click the verification button again.');

  async function postBackend(pathname, payload) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetchImpl(config.backendUrl + pathname, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SkidzVerifyServer/1.0',
        'X-Skidz-Timestamp': String(timestamp),
        'X-Skidz-Signature': signature(config.relaySecret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(config.backendTimeoutMs),
    });
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
    return { ok: response.ok, status: response.status, body: parsed, raw };
  }

  function backendFailure(res, label) {
    return send(res, 502, errorPage('Verification temporarily unavailable', 'The relay could not reach the verification backend. Try again in a moment.'));
  }

  async function showChallenge(req, res, token) {
    const payload = verifyToken(token, config.relaySecret);
    if (!payload || !payload.n || !payload.s) return send(res, 400, expired());

    let deviceId = readCookie(req, COOKIE_NAME);
    const extra = {};
    if (!deviceId) {
      deviceId = newDeviceId();
      extra['Set-Cookie'] = deviceCookie(COOKIE_NAME, deviceId, secure);
    }
    return send(
      res,
      200,
      pages.challengePage({
        guildName: payload.gn || 'this server',
        username: payload.un || 'your Discord account',
        action: '/v/' + token,
        powSeed: payload.s,
        powBits: Math.max(0, Math.min(24, Number(payload.b) || 0)),
        stun: config.stunServer,
        deviceId,
        pingUrl: '/t/' + token,
        privacyUrl: '/privacy',
        captchaSvg: captcha.svg(config.relaySecret, payload.s),
      }),
      extra
    );
  }

  async function submitChallenge(req, res, token, ip) {
    const payload = verifyToken(token, config.relaySecret);
    if (!payload || !payload.n || !payload.s) return send(res, 400, expired());

    let form;
    try {
      form = await readForm(req, FORM_LIMIT);
    } catch (_) {
      return send(res, 413, errorPage('Invalid request', 'The form is too large.'), { Connection: 'close' });
    }
    if (form.get('consent') !== '1') return send(res, 400, errorPage('Consent required', 'You must accept the terms to continue.'));
    if (!captcha.matches(config.relaySecret, payload.s, form.get('captcha'))) {
      return send(res, 400, errorPage('Check failed', 'The characters did not match. Reload the page and try again.'));
    }
    if (!verifyPow(payload.s, form.get('pow'), Math.max(0, Math.min(24, Number(payload.b) || 0)))) {
      return send(res, 400, errorPage('Check failed', 'The anti-bot check failed. Reload the page and try again.'));
    }

    const intel = String(form.get('intel') || '');
    if (Buffer.byteLength(intel, 'utf8') > 64 * 1024) return send(res, 413, errorPage('Invalid request', 'The browser report is too large.'));

    const cookieId = readCookie(req, COOKIE_NAME);
    const deviceId = cookieId || newDeviceId();
    const tz = String(form.get('tz') || '').slice(0, 64);
    const offset = Number.parseInt(form.get('tzo'), 10);

    let result;
    try {
      result = await postBackend('/relay/challenge', {
        token,
        ip,
        deviceId,
        cookie: cookieId || '',
        receivedAt: Date.now(),
        form: {
          pow: String(form.get('pow') || ''),
          tz: /^[A-Za-z0-9_+\-/]*$/.test(tz) ? tz : '',
          tzo: Number.isFinite(offset) && Math.abs(offset) <= 900 ? offset : null,
          intel,
          captcha: String(form.get('captcha') || ''),
        },
        headers: forwardedHeaders(req, ip),
      });
    } catch (error) {
      console.error('[relay] backend challenge: ' + error.message);
      return backendFailure(res, 'challenge');
    }

    if (!result.body) return send(res, 502, errorPage('Verification temporarily unavailable', 'The backend returned an unreadable response. Try again in a moment.'));
    if (result.body.error) {
      const status = Number(result.body.error.status) || 400;
      return send(res, status, errorPage(result.body.error.title || 'Verification failed', result.body.error.message || 'Try again from Discord.'));
    }
    if (!result.body.redirectUrl) return send(res, 502, errorPage('Verification temporarily unavailable', 'The backend did not return the Discord authorization. Try again in a moment.'));

    let target;
    try {
      target = new URL(result.body.redirectUrl);
    } catch (_) {
      return send(res, 502, errorPage('Verification temporarily unavailable', 'The backend returned an invalid authorization URL.'));
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return send(res, 502, errorPage('Verification temporarily unavailable', 'The backend returned an invalid authorization URL.'));

    const setCookie = result.body.cookie || (!cookieId ? deviceCookie(COOKIE_NAME, deviceId, secure) : null);
    return send(res, 302, '', { Location: target.toString(), ...(setCookie ? { 'Set-Cookie': setCookie } : {}) });
  }

  async function callback(req, res, url, ip) {
    let result;
    try {
      result = await postBackend('/relay/callback', {
        ip,
        receivedAt: Date.now(),
        query: {
          code: url.searchParams.get('code') || '',
          state: url.searchParams.get('state') || '',
          error: url.searchParams.get('error') || '',
          error_description: url.searchParams.get('error_description') || '',
        },
        headers: forwardedHeaders(req, ip),
      });
    } catch (error) {
      console.error('[relay] backend callback: ' + error.message);
      return backendFailure(res, 'callback');
    }

    if (!result.body || !result.body.html) {
      const message = result.body && result.body.error ? result.body.error.message : 'The backend returned an unreadable response. Start again from Discord.';
      return send(res, 502, errorPage('Verification temporarily unavailable', message));
    }
    const status = Number(result.body.status) >= 200 && Number(result.body.status) <= 599 ? Number(result.body.status) : 200;
    const extra = { 'Content-Type': 'text/html; charset=utf-8' };
    if (result.body.csp) extra['Content-Security-Policy'] = String(result.body.csp);
    if (result.body.cookie) extra['Set-Cookie'] = String(result.body.cookie);
    return send(res, status, String(result.body.html), extra);
  }

  async function handler(req, res) {
    try {
      const ip = clientIp(req, config);
      const url = new URL(req.url, config.publicUrl);

      if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'skidz-verify-relay', backend: config.backendUrl, uptime: Math.round(process.uptime()) });
      if (url.pathname === '/assets/banner.png' || url.pathname === '/assets/logo.png') {
        const image = url.pathname.endsWith('banner.png') ? assets.banner : assets.logo;
        if (!image) return send(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return res.end(image);
      }
      if (url.pathname.startsWith('/assets/fonts/')) {
        const font = fonts[url.pathname.slice('/assets/fonts/'.length)];
        if (!font) return send(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'font/ttf', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
        return res.end(font);
      }
      if (url.pathname === '/privacy' && req.method === 'GET') {
        return send(res, 200, pages.privacyPage({ botName: config.botName, retentionDays: config.ipRetentionDays, deviceRetentionDays: config.deviceRetentionDays, logRetentionDays: config.logRetentionDays, stun: Boolean(config.stunServer) }));
      }
      if (url.pathname === '/' && req.method === 'GET') return send(res, 200, pages.landingPage(config.botName));
      if (url.pathname === '/callback' && req.method === 'GET') return await callback(req, res, url, ip);

      const ping = PING_PATH.exec(url.pathname);
      if (ping && req.method === 'GET') {
        if (!verifyToken(ping[1], config.relaySecret)) return send(res, 404, errorPage('Page not found', ''));
        res.writeHead(204, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end();
      }

      const match = TOKEN_PATH.exec(url.pathname);
      if (match && req.method === 'GET') return await showChallenge(req, res, match[1]);
      if (match && req.method === 'POST') return await submitChallenge(req, res, match[1], ip);
      if (match) return send(res, 405, errorPage('Method not allowed', ''), { Allow: 'GET, POST' });
      return send(res, 404, errorPage('Page not found', 'This address does not exist.'));
    } catch (error) {
      console.error('[relay] ' + error.message);
      if (!res.headersSent) send(res, 500, errorPage('Unexpected error', 'Try again in a moment.'));
    }
  }

  const server = http.createServer(handler);
  server.headersTimeout = 15000;
  server.requestTimeout = 20000;

  return {
    server,
    handler,
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port === undefined ? config.port : port, host || config.host, () => resolve(server.address()));
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { createRelayServer, clientIp, TOKEN_PATH, PING_PATH, readCookie, deviceCookie, newDeviceId };
