/* Skidz Verify — src/web/pages.js
 * Pages HTML de la vérification (noir pur, compactes, responsive, accessibles) :
 * chaque valeur dynamique est échappée, un seul script (le collecteur, avec un nonce par réponse).
 * Inter est servi localement, aucun CDN, aucun captcha tiers. La page dit précisément ce qui est contrôlé.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { THEME, DECOR } = require('./theme');

const CLIENT_SCRIPT = fs.readFileSync(path.join(__dirname, 'client', 'collector.js'), 'utf8');

const esc = (value) =>
  String(value == null ? '': value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const LOGO = '<svg width="56" height="56" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="42" stroke-width="5.5"/><path d="M32 69V31l36 38V31" stroke-width="9.5"/></g><path d="M50 6.5l2.2 6 6 2.2-6 2.2-2.2 6-2.2-6-6-2.2 6-2.2z" fill="currentColor"/></svg>';

/* Brand assets served by the verification server (root logo.png and banner.png). */
let ASSETS = { banner: null, logo: null, brand: 'Skidz' };
function setAssets(next) {
  ASSETS = {
    banner: next && next.banner ? String(next.banner) : null,
    logo: next && next.logo ? String(next.logo) : null,
    brand: (next && next.brand) || 'Skidz',
  };
}

const STYLE = `
:root{color-scheme:dark;--bg:#000;--panel:#08080a;--panel2:#0e0e11;--line:#1c1c21;--text:#f5f5f7;--mute:#8b8b93;--ok:#7ee787;--err:#ff7b72;--warn:#e3b341;--focus:#fff;--radius:18px}
*{box-sizing:border-box}html,body{min-height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:clamp(12px,4vw,28px)}
main{width:100%;max-width:520px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:clamp(22px,5vw,36px);box-shadow:0 20px 60px rgba(0,0,0,.25)}
header{text-align:center}.logo{display:inline-block}.ok{color:var(--ok)}.err{color:var(--err)}.warn{color:var(--warn)}
h1{margin:12px 0 4px;font-size:clamp(21px,5vw,25px);letter-spacing:.005em;text-align:center}
p{margin:10px 0;color:var(--mute)}b,strong{color:var(--text)}a{color:var(--text)}
.sub{text-align:center;font-size:14.5px}
.steps{display:flex;gap:6px;margin:22px 0 4px;padding:0;list-style:none;counter-reset:s}
.steps li{flex:1;text-align:center;font-size:12px;color:var(--mute);border-top:3px solid var(--line);padding-top:7px;transition:.2s}
.steps li.on{color:var(--text);border-color:var(--text)}.steps li.done{border-color:var(--ok);color:var(--ok)}
#barwrap{height:5px;border-radius:5px;background:var(--panel2);overflow:hidden;margin:14px 0 4px}
#bar{height:100%;width:0;background:var(--text);border-radius:5px;transition:width .35s ease}
#checks{list-style:none;margin:10px 0 0;padding:0;border:1px solid var(--line);border-radius:14px;overflow:hidden}
#checks li{display:flex;gap:12px;align-items:center;padding:11px 14px;font-size:14.5px;border-bottom:1px solid var(--line);color:var(--mute)}
#checks li:last-child{border-bottom:0}
.dot{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--line);position:relative}
#checks li[data-state=run] .dot{border-color:var(--text) var(--line) var(--line) var(--line);animation:spin .8s linear infinite}
#checks li[data-state=ok] .dot{background:var(--ok);border-color:var(--ok)}
#checks li[data-state=ok] .dot::after,#checks li[data-state=warn] .dot::after{content:"";position:absolute;left:4px;top:1px;width:5px;height:9px;border:solid var(--bg);border-width:0 2px 2px 0;transform:rotate(45deg)}
#checks li[data-state=warn] .dot{background:var(--warn);border-color:var(--warn)}
#checks li[data-state=ok],#checks li[data-state=warn]{color:var(--text)}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#checks li[data-state=run] .dot{animation:none}#bar{transition:none}}
.box{font-size:13.5px;border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:14px;color:var(--mute);background:var(--panel2)}.box b{display:block;margin-bottom:3px}
details{margin-top:14px;border:1px solid var(--line);border-radius:14px;padding:2px 14px;font-size:13.5px;color:var(--mute)}
summary{cursor:pointer;padding:10px 0;color:var(--text);font-weight:600}summary:focus-visible,button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:8px}
details ul{margin:0 0 10px;padding-left:18px}details li{margin:5px 0}
label.consent{display:flex;gap:12px;align-items:flex-start;margin-top:16px;font-size:14px;color:var(--mute);cursor:pointer}label.consent input{margin-top:3px;flex:none;width:19px;height:19px;accent-color:var(--text)}
button,.btn{display:block;width:100%;margin-top:18px;padding:15px 18px;border:0;border-radius:14px;background:var(--text);color:var(--bg);font:700 16px/1 inherit;cursor:pointer;text-decoration:none;text-align:center;transition:opacity .2s,transform .1s}
button:hover:not(:disabled),.btn:hover{opacity:.9}button:active:not(:disabled){transform:scale(.99)}button:disabled{opacity:.3;cursor:not-allowed}
#status{min-height:22px;font-size:14px;text-align:center;margin:10px 0 0}.small{font-size:12.5px}.ref{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:2px 8px;color:var(--text)}
ul.reasons{text-align:left;color:var(--mute);padding-left:20px;font-size:14px}ul.reasons li{margin:5px 0}
.result{text-align:center}.result h1{display:flex;gap:10px;align-items:center;justify-content:center}
.mark{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;border:2px solid currentColor;font-size:18px}
html:not(.js) .steps,html:not(.js) #checks,html:not(.js) #barwrap{display:none}
.hero{margin:0 0 16px}.hero img{display:block;width:100%;height:auto;border-radius:16px;border:1px solid var(--line)}
.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 6px;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute)}
.brand img{width:26px;height:26px;border-radius:8px;object-fit:contain}
.captcha{display:flex;gap:14px;align-items:center;margin-top:16px;border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--panel2)}
.captcha-img{display:block;flex:none;max-width:100%;height:auto;border-radius:10px}
.cap-field{flex:1;min-width:0}.cap-field label{display:block;font-size:13px;color:var(--mute)}
.cap-field input{width:100%;margin-top:6px;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:700 17px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;text-transform:uppercase}
@media (max-width:430px){.captcha{flex-direction:column;align-items:stretch}.captcha-img{margin:0 auto}}
`;

/** Jeton à usage unique pour la CSP et le script de la page. */
const nonce = () => crypto.randomBytes(16).toString('base64');

function csp(scriptNonce) {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "script-src 'nonce-" + scriptNonce + "'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "frame-src 'none'",
    "form-action 'self' https://discord.com",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Bandeau de marque : la bannière racine, puis le logo (repli SVG si les fichiers sont absents). */
function brandMarkup(tone) {
  if (ASSETS.logo) return '<div class="brand"><img src="' + esc(ASSETS.logo) + '" alt="' + esc(ASSETS.brand) + '" width="26" height="26"><span>' + esc(ASSETS.brand) + '</span></div>';
  return '<header><span class="logo ' + esc(tone || '') + '">' + LOGO + '</span></header>';
}

function layout(title, body, options) {
  const opts = options || {};
  const scriptNonce = opts.nonce || nonce();
  const hero = opts.hero && ASSETS.banner ? '<div class="hero"><img src="' + esc(ASSETS.banner) + '" alt="" width="2172" height="724"></div>' : '';
  return {
    csp: csp(scriptNonce),
    html:
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#000000"><title>' + esc(title) + '</title><style>' + STYLE + THEME + '</style></head><body>' + DECOR + '<main' + (opts.wide ? ' class="wide"' : '') + '>' +
      hero + brandMarkup(opts.tone) + body +
      (opts.script ? '<script nonce="' + scriptNonce + '">' + opts.script + '</script>' : '') +
      '<p class="legal">Relay on Render · checks run in your browser · signed report to the backend</p>' +
      '</main></body></html>',
  };
}

const CHECKLIST = [
  ['browser', 'Browser and time zone'],
  ['device', 'Device (screen, graphics, audio, fonts)'],
  ['network', 'Connection (WebRTC and latency)'],
  ['pow', 'Proof of work (anti-bot)'],
];

/**
 * @param {{guildName: string, username: string, action: string, powSeed: string, powBits: number, stun?: string, deviceId: string, pingUrl: string, privacyUrl: string, retentionDays?: number}} input
 */
function challengePage(input) {
  const scriptNonce = nonce();
  return layout(
    'Verification — ' + input.guildName,
    '<h1>Verification</h1><p class="sub">Server <b>' + esc(input.guildName) + '</b> · account <b>' + esc(input.username) + '</b></p>' +
      '<ol class="steps" aria-label="Steps"><li class="on">1 · Checks</li><li>2 · Discord</li><li>3 · Access</li></ol>' +
      '<form id="f" method="post" action="' + esc(input.action) + '" data-seed="' + esc(input.powSeed) + '" data-bits="' + Number(input.powBits) + '" data-stun="' + esc(input.stun || '') + '" data-did="' + esc(input.deviceId) + '" data-ping="' + esc(input.pingUrl) + '" autocomplete="off">' +
      '<input type="hidden" name="pow" id="pow"><input type="hidden" name="tz" id="tz"><input type="hidden" name="tzo" id="tzo"><input type="hidden" name="intel" id="intel">' +
      '<div id="barwrap" role="progressbar" aria-label="Checks progress"><div id="bar"></div></div>' +
      '<ul id="checks" aria-live="polite">' + CHECKLIST.map(([id, label]) => '<li id="c-' + id + '" data-state="wait"><span class="dot" aria-hidden="true"></span><span class="c-text">' + esc(label) + '</span></li>').join('') + '</ul>' +
      '<details><summary>What exactly is checked</summary><ul>' +
      '<li><b>Your browser</b>: model, language, time zone, screen size, graphics card, how a test drawing and a test sound are rendered, installed fonts — to recognize a bot, a virtual machine, and the same device used by several accounts.</li>' +
      '<li><b>Your connection</b>: address type, DNS name of the address, WebRTC test and latency — to spot a VPN, a proxy or Tor. Your IP address is never stored in clear text.</li>' +
      '<li><b>Your behavior</b> on this page: movements, keystrokes, duration — as an encrypted summary (never the keys typed nor the raw paths).</li>' +
      '<li><b>A technical identifier</b> (cookie and local storage of this page) to recognize the same browser.</li>' +
      '<li><b>Never</b>: your other sites, your history, your files, your location, your clipboard, your extensions, your messages.</li></ul></details>' +
      '<div class="box"><b>Next: Discord</b>You will be redirected to Discord to authorize this bot to know your ID and, <u>if the server is ever lost</u>, to automatically add you to its replacement server. This is the “add to servers for you” authorization: it is what lets the staff bring you back if the server is lost.</div>' +
      '<div class="captcha">' + (input.captchaSvg || '') +
      '<div class="cap-field"><label for="captcha">Type the five characters</label><input id="captcha" name="captcha" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" required></div></div>' +
      '<label class="consent"><input type="checkbox" id="consent" name="consent" value="1"><span>I understand and accept these checks and the automatic re-invite by this bot. <a href="' + esc(input.privacyUrl) + '">Privacy</a> · delete at any time with <b>/verify-data</b>.</span></label>' +
      '<noscript><p class="err">JavaScript is required: the checks run in your browser.</p></noscript>' +
      '<button id="go" type="submit" disabled>Continue with Discord</button><p id="status" class="small" role="status" aria-live="polite"></p></form>',
    { nonce: scriptNonce, script: CLIENT_SCRIPT }
  );
}

const RESULTS = {
  ok: { tone: 'ok', mark: '✔' },
  review: { tone: 'warn', mark: '⏳' },
  denied: { tone: 'err', mark: '✖' },
  error: { tone: 'err', mark: '!' },
};

/**
 * @param {'ok'|'review'|'denied'|'error'} kind
 * @param {string} title
 * @param {string} message
 * @param {string[]} [extra]  conseils affichés en liste
 * @param {string} [ref]      référence à communiquer au staff (numéro d'événement)
 */
function resultPage(kind, title, message, extra, ref) {
  const meta = RESULTS[kind] || RESULTS.error;
  const step = kind === 'ok' ? '3' : '2';
  return layout(
    title,
    '<div class="result"><h1><span class="mark ' + meta.tone + '" aria-hidden="true">' + meta.mark + '</span> ' + esc(title) + '</h1><p>' + esc(message) + '</p>' +
      (extra && extra.length ? '<ul class="reasons">' + extra.map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul>' : '') +
      (ref ? '<p class="small">Reference to give the staff: <span class="ref">' + esc(ref) + '</span></p>' : '') +
      '<p class="small">' + (kind === 'ok' ? 'Go back to Discord: you now have access to the server. You can close this page.' : 'You can close this page.') + '</p></div>' +
      '<ol class="steps" aria-hidden="true"><li class="done">1 · Checks</li><li class="' + (step === '3' ? 'done' : 'on') + '">2 · Discord</li><li class="' + (step === '3' ? 'done' : '') + '">3 · Access</li></ol>',
    { tone: meta.tone }
  );
}

function landingPage(botName) {
  return layout(botName, '<h1>' + esc(botName) + '</h1><p class="sub">This address is used for Discord server verifications. To verify your account, use the button in your server\'s verification channel.</p><a class="btn" href="/privacy">Privacy policy</a>', { hero: true });
}

function privacyPage(input) {
  return layout(
    'Privacy — ' + input.botName,
    '<h1>Privacy</h1><p>' + esc(input.botName) + ' verifies that the members of a server are real people, spots VPNs and multiple accounts, and lets the owner re-invite them if the server is lost. <b>The browser checks run on this relay</b>; the report is sent over a signed request to the verification backend, which keeps the decision and the Discord authorization.</p>' +
      '<details open><summary>What is collected</summary><ul>' +
      '<li><b>Discord</b>: ID, username, avatar, OAuth2 token (scopes <i>identify</i> and <i>guilds.join</i>), account creation date.</li>' +
      '<li><b>Browser</b>: User-Agent, languages, time zone, screen size, number of cores, memory, graphics card (name and capabilities), fingerprints of a test drawing and a test sound, installed fonts, devices (count only), permission states. Used to recognize a bot, a virtual machine or the same device.</li>' +
      '<li><b>Network</b>: address type, reverse DNS name (only the provider is kept), WebRTC test' + (input.stun ? ' against the bot\'s STUN server' : '') + ', latency, request headers.</li>' +
      '<li><b>Behavior</b> on the page: encrypted summary of movements, keystrokes and duration (no keys typed, no path).</li>' +
      '<li><b>Technical identifier</b>: a random code in a cookie and in the local storage of this page, to recognize this browser.</li></ul></details>' +
      '<details open><summary>What is kept, and for how long</summary><ul>' +
      '<li><b>IP address</b>: never in clear text. It is turned into an irreversible fingerprint (HMAC); these network fingerprints are purged after ' + Number(input.retentionDays) + ' days.</li>' +
      '<li><b>Device fingerprints</b> (hashed as well): ' + Number(input.deviceRetentionDays || 180) + ' days, to spot the return of a banned account under another account.</li>' +
      '<li><b>Verification log</b> (who, when, which decision, which signals): ' + Number(input.logRetentionDays || 90) + ' days.</li>' +
      '<li><b>OAuth2 token</b>: encrypted (AES-256-GCM). It is only used to re-invite you to a server whose owner re-invites you, never to read your messages or act on your behalf.</li></ul></details>' +
      '<details><summary>Your rights</summary><ul><li>The <b>/verify-data</b> command on Discord lets you view, revoke the authorization and delete all your data.</li>' +
      '<li>An account on a server\'s blocklist stays known to that server (ID and fingerprints), to prevent a sanction from being bypassed.</li>' +
      '<li>You can also revoke the application in Discord → Settings → Authorized Apps.</li></ul></details>',
    { wide: true }
  );
}

module.exports = { challengePage, resultPage, landingPage, privacyPage, setAssets, esc, nonce, csp, CLIENT_SCRIPT };
