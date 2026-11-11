'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createRelayServer } = require('../src/server');
const { loadConfig } = require('../src/config');
const { signToken, signature, verifySignature } = require('../src/security');
const { solvePow } = require('../src/pow');
const { codeFor } = require('../src/captcha');

const SECRET = 'r'.repeat(40);

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function startBackend() {
  const seen = { challenge: null, callback: null, signatures: [] };
  const server = http.createServer(async (req, res) => {
    const raw = await readBody(req);
    const timestamp = req.headers['x-skidz-timestamp'];
    const provided = req.headers['x-skidz-signature'];
    seen.signatures.push({ path: req.url, ok: verifySignature(SECRET, timestamp, raw, provided), raw });
    if (req.url === '/relay/challenge') {
      seen.challenge = JSON.parse(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ redirectUrl: 'https://discord.com/oauth2/authorize?client_id=1&state=s', cookie: 'nm_did=backend-cookie; Path=/; HttpOnly' }));
    }
    if (req.url === '/relay/callback') {
      seen.callback = JSON.parse(raw);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 200, html: '<!doctype html><title>Verified</title><p>verified member</p>', csp: "default-src 'none'; style-src 'unsafe-inline'", cookie: 'nm_did=callback-cookie; Path=/; HttpOnly' }));
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, seen, port: server.address().port };
}

async function setup() {
  const backend = await startBackend();
  const config = {
    publicUrl: 'http://127.0.0.1:0',
    backendUrl: 'http://127.0.0.1:' + backend.port,
    relaySecret: SECRET,
    port: 0,
    host: '127.0.0.1',
    trustProxyHops: 1,
    backendTimeoutMs: 5000,
    stunServer: '',
    botName: 'Skidz Verify',
    ipRetentionDays: 30,
    deviceRetentionDays: 180,
    logRetentionDays: 90,
  };
  const relay = createRelayServer(config);
  const address = await relay.listen(0, '127.0.0.1');
  config.publicUrl = 'http://127.0.0.1:' + address.port;
  return {
    backend,
    relay,
    base: config.publicUrl,
    async close() {
      await relay.close();
      await new Promise((resolve) => backend.server.close(resolve));
    },
  };
}

test('relais : page, contrôles, rapport signé et redirection OAuth', async () => {
  const env = await setup();
  try {
    const seed = 'a'.repeat(32);
    const token = signToken({ n: 'nonce-1', g: 'guild-1', u: 'user-1', s: seed, b: 6, gn: 'Guild', un: 'alice' }, SECRET, 900);
    const page = await fetch(env.base + '/v/' + token, { headers: { 'X-Forwarded-For': '81.2.3.4' } });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(page.headers.get('set-cookie'), /nm_did=.+HttpOnly/);
    const html = await page.text();
    assert.match(html, /Guild/);
    assert.match(html, /alice/);
    assert.ok(html.includes('data-seed="' + seed + '"'));

    const form = new URLSearchParams({
      consent: '1',
      captcha: codeFor(SECRET, seed),
      pow: solvePow(seed, 6),
      tz: 'Europe/Paris',
      tzo: '-60',
      intel: JSON.stringify({ v: 1, nav: { ua: 'test' }, dv: { id: 'A'.repeat(24) } }),
    });
    const post = await fetch(env.base + '/v/' + token, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '81.2.3.4', Cookie: 'nm_did=' + 'B'.repeat(24) },
      body: form.toString(),
    });
    assert.equal(post.status, 302);
    assert.equal(post.headers.get('location'), 'https://discord.com/oauth2/authorize?client_id=1&state=s');
    assert.equal(env.backend.seen.challenge.ip, '81.2.3.4');
    assert.equal(env.backend.seen.challenge.deviceId, 'B'.repeat(24));
    assert.equal(env.backend.seen.challenge.form.captcha, codeFor(SECRET, seed));
    assert.equal(env.backend.seen.challenge.headers['x-forwarded-for'], '81.2.3.4');
    assert.ok(env.backend.seen.signatures[0].ok, 'signature challenge valide');

    const callback = await fetch(env.base + '/callback?code=code-1&state=state-1', { headers: { 'X-Forwarded-For': '81.2.3.4' } });
    assert.equal(callback.status, 200);
    assert.match(await callback.text(), /verified member/);
    assert.equal(callback.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'");
    assert.equal(env.backend.seen.callback.query.code, 'code-1');
    assert.equal(env.backend.seen.callback.query.state, 'state-1');
    assert.ok(env.backend.seen.signatures[1].ok, 'signature callback valide');
  } finally {
    await env.close();
  }
});

test('relais : jeton falsifié, captcha faux et route backend non exposée sont refusés', async () => {
  const env = await setup();
  try {
    const seed = 'b'.repeat(32);
    const token = signToken({ n: 'nonce-2', g: 'guild-1', u: 'user-1', s: seed, b: 6 }, SECRET, 900);
    const forged = await fetch(env.base + '/v/' + token + 'x');
    assert.equal(forged.status, 400);

    const form = new URLSearchParams({ consent: '1', captcha: 'ZZZZZ', pow: solvePow(seed, 6), tz: 'Europe/Paris', tzo: '-60', intel: '{}' });
    const badCaptcha = await fetch(env.base + '/v/' + token, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': '81.2.3.4' }, body: form.toString() });
    assert.equal(badCaptcha.status, 400);

    const privateBackend = await fetch(env.base + '/relay/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ip: '81.2.3.4' }) });
    assert.equal(privateBackend.status, 404, 'le relais n’expose pas la route privée du backend');
    assert.equal(env.backend.seen.challenge, null, 'aucun rapport envoyé');

    const health = await fetch(env.base + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
  } finally {
    await env.close();
  }
});

test('relais : la signature expire et le corps signé reste exact', async () => {
  const body = '{"a":1}';
  const now = Math.floor(Date.now() / 1000);
  assert.ok(verifySignature(SECRET, now, body, signature(SECRET, now, body), now));
  assert.ok(!verifySignature(SECRET, now - 301, body, signature(SECRET, now - 301, body), now));
  assert.ok(!verifySignature(SECRET, now, body, signature(SECRET, now, body + ' '), now));
});

test('configuration : URL Render automatique, API explicite, aucun domaine codé', () => {
  const config = loadConfig({
    RENDER_EXTERNAL_URL: 'https://relay.onrender.com/',
    BACKEND_URL: 'https://limoon-space.cloud/',
    RELAY_SECRET: 'x'.repeat(32),
  });
  assert.equal(config.publicUrl, 'https://relay.onrender.com');
  assert.equal(config.backendUrl, 'https://limoon-space.cloud');
  assert.equal(config.port, 10000);
  assert.throws(
    () => loadConfig({ BACKEND_URL: 'https://limoon-space.cloud', RELAY_SECRET: 'x'.repeat(32) }),
    /RENDER_EXTERNAL_URL/
  );
});
