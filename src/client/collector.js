/* Skidz Verify — src/web/client/collector.js
 * Script exécuté DANS le navigateur du membre, sur la page de vérification (intégré à la page avec un nonce CSP).
 * Il fait trois choses, visibles dans la liste « Contrôles » de la page :
 *   1. résout la preuve de travail (anti-robot, sans service externe) ;
 *   2. mesure le navigateur : identité, écran, fuseau, GPU, canevas, audio, polices, WebRTC, latence, comportement ;
 *   3. envoie un rapport JSON (champ « intel ») avec le formulaire — le serveur ne lui fait pas confiance, il le recoupe.
 * Rien n'est lu en dehors de cette page : ni historique, ni cookies d'autres sites, ni fichiers, ni presse-papiers,
 * ni localisation, ni liste des extensions. Aucune requête ne part vers un autre serveur que celui de la page (et le
 * serveur STUN intégré, pour tester WebRTC). Écrit en ES2017 : aucun outil de compilation.
 */
(function () {
  'use strict';

  var T0 = performance.now();
  var form = document.getElementById('f');
  var button = document.getElementById('go');
  var consent = document.getElementById('consent');
  var statusLine = document.getElementById('status');
  var bar = document.getElementById('bar');
  var seed = form.getAttribute('data-seed');
  var bits = parseInt(form.getAttribute('data-bits'), 10) || 0;
  var stunServer = form.getAttribute('data-stun') || '';
  var deviceId = form.getAttribute('data-did') || '';
  var pingUrl = form.getAttribute('data-ping') || '';
  var intel = { v: 1, t: Date.now() };
  var finished = { pow: false, collect: false };
  var submitting = false;
  var powResult = null;

  /* ---------------------------------------------------------------- */
  /* Aides                                                              */
  /* ---------------------------------------------------------------- */

  function safe(fn, fallback) {
    try {
      var value = fn();
      return value === undefined ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      Promise.resolve(promise).then(function (value) { if (!done) { done = true; clearTimeout(timer); resolve(value); } }, function () { if (!done) { done = true; clearTimeout(timer); resolve(fallback); } });
    });
  }

  function hex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  }

  /* SHA-256 si disponible (contexte sécurisé), sinon repli FNV-1a 64 bits : l'empreinte reste comparable entre visites. */
  function digest(text) {
    var bytes = new TextEncoder().encode(String(text));
    if (window.crypto && crypto.subtle) return crypto.subtle.digest('SHA-256', bytes).then(function (buf) { return hex(buf).slice(0, 32); });
    var h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
    for (var i = 0; i < bytes.length; i++) { h1 = Math.imul(h1 ^ bytes[i], 16777619); h2 = Math.imul(h2 + bytes[i], 2246822519); }
    return Promise.resolve(((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + '00000000000000000000000000000000').slice(0, 32));
  }

  function mark(id, state, text) {
    var item = document.getElementById('c-' + id);
    if (!item) return;
    item.setAttribute('data-state', state);
    if (text) {
      var label = item.querySelector('.c-text');
      if (label) label.textContent = text;
    }
  }

  function progress() {
    var total = 0;
    var ok = 0;
    var items = document.querySelectorAll('#checks li');
    for (var i = 0; i < items.length; i++) {
      total++;
      var s = items[i].getAttribute('data-state');
      if (s === 'ok' || s === 'warn') ok++;
    }
    if (bar) bar.style.width = Math.round((ok / Math.max(1, total)) * 100) + '%';
  }

  function updateButton() {
    var ready = finished.pow && finished.collect && consent.checked && !submitting;
    button.disabled = !ready;
    if (!finished.pow || !finished.collect) statusLine.textContent = 'Analyzing…';
    else if (!consent.checked) statusLine.textContent = 'Accept the terms to continue.';
    else statusLine.textContent = 'All set.';
    progress();
  }

  /* ---------------------------------------------------------------- */
  /* Preuve de travail                                                  */
  /* ---------------------------------------------------------------- */

  function zeros(bytes) {
    var count = 0;
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) { count += 8; continue; }
      count += Math.clz32(bytes[i]) - 24;
      break;
    }
    return count;
  }

  async function solvePow() {
    var started = performance.now();
    if (!bits) { intel.pw = { ms: 0, iters: 0 }; return '0'; }
    if (!(window.crypto && crypto.subtle)) throw new Error('crypto.subtle unavailable (HTTPS required)');
    var encoder = new TextEncoder();
    var batch = 256;
    for (var start = 0; ; start += batch) {
      var tasks = [];
      for (var i = 0; i < batch; i++) tasks.push(crypto.subtle.digest('SHA-256', encoder.encode(seed + ':' + (start + i))));
      var results = await Promise.all(tasks);
      for (var j = 0; j < results.length; j++) {
        if (zeros(new Uint8Array(results[j])) >= bits) {
          intel.pw = { ms: Math.round(performance.now() - started), iters: start + j + 1 };
          return String(start + j);
        }
      }
      if (start > 0 && start % (batch * 40) === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Navigateur, écran, fuseau                                          */
  /* ---------------------------------------------------------------- */

  function nativeOk() {
    var keys = ['hardwareConcurrency', 'userAgent', 'languages', 'platform', 'webdriver'];
    for (var i = 0; i < keys.length; i++) {
      var d = Object.getOwnPropertyDescriptor(Navigator.prototype, keys[i]);
      if (d && d.get && Function.prototype.toString.call(d.get).indexOf('[native code]') === -1) return 0;
    }
    return 1;
  }

  function automationTraces() {
    var out = [];
    var w = window;
    if (navigator.webdriver) out.push('webdriver');
    if (/HeadlessChrome/.test(navigator.userAgent)) out.push('headlessua');
    if (w.callPhantom || w._phantom || w.phantom) out.push('phantom');
    if (w.__nightmare) out.push('nightmare');
    if (w.domAutomation || w.domAutomationController) out.push('domautomation');
    if (w.__playwright__binding__ || w.__pwInitScripts || w.__playwright) out.push('playwright');
    if (w.__puppeteer_evaluation_script__) out.push('puppeteer');
    if (document.documentElement.getAttribute('webdriver')) out.push('selenium');
    for (var key in document) { if (/^\$[a-z]dc_|^__(webdriver|driver|selenium|fxdriver)/.test(key)) { out.push('selenium'); break; } }
    for (var k2 in w) { if (/^(cdc_|\$cdc_|__webdriver_|__selenium_|_selenium|calledSelenium)/.test(k2)) { out.push('selenium'); break; } }
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function collectNavigator() {
    var n = navigator;
    var own = Object.getOwnPropertyNames(n).filter(function (name) { return ['userAgent', 'platform', 'languages', 'language', 'hardwareConcurrency', 'deviceMemory', 'vendor', 'webdriver', 'maxTouchPoints', 'plugins', 'appVersion'].indexOf(name) !== -1; });
    intel.nav = {
      ua: n.userAgent, plat: n.platform, vendor: n.vendor, lang: n.language, langs: Array.prototype.slice.call(n.languages || []),
      hw: n.hardwareConcurrency, mem: n.deviceMemory, touch: n.maxTouchPoints, cookie: n.cookieEnabled ? 1 : 0, dnt: n.doNotTrack || '',
      wd: n.webdriver ? 1 : 0, pdf: safe(function () { return n.pdfViewerEnabled ? 1 : 0; }, null),
      plug: safe(function () { return n.plugins.length; }, 0), mime: safe(function () { return n.mimeTypes.length; }, 0),
      own: own, native: safe(nativeOk, 1), java: safe(function () { return n.javaEnabled() ? 1 : 0; }, null), online: n.onLine ? 1 : 0,
      uad: {},
    };
    intel.ac = automationTraces();
    intel.sp = safe(function () { return window.speechSynthesis ? speechSynthesis.getVoices().length : 0; }, 0);
  }

  async function collectUserAgentData() {
    var uad = navigator.userAgentData;
    if (!uad) return;
    var out = { brands: (uad.brands || []).map(function (b) { return { b: b.brand, v: b.version }; }), mobile: uad.mobile ? 1 : 0, plat: uad.platform };
    try {
      var high = await uad.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion']);
      out.arch = high.architecture; out.bits = high.bitness; out.model = high.model; out.pv = high.platformVersion; out.fv = high.uaFullVersion;
    } catch (e) { /* refusé */ }
    intel.nav.uad = out;
  }

  function collectScreen() {
    var s = screen;
    intel.scr = {
      w: s.width, h: s.height, aw: s.availWidth, ah: s.availHeight, cd: s.colorDepth, pd: s.pixelDepth, dpr: window.devicePixelRatio,
      ow: window.outerWidth, oh: window.outerHeight, iw: window.innerWidth, ih: window.innerHeight,
      orient: safe(function () { return s.orientation && s.orientation.type; }, ''), hdr: safe(function () { return matchMedia('(dynamic-range: high)').matches ? 1 : 0; }, null),
    };
  }

  function collectTimezone() {
    var year = new Date().getFullYear();
    var o = Intl.DateTimeFormat().resolvedOptions();
    intel.tz = {
      name: o.timeZone, off: new Date().getTimezoneOffset(), jan: new Date(year, 0, 1).getTimezoneOffset(), jul: new Date(year, 6, 1).getTimezoneOffset(),
      loc: o.locale, cal: o.calendar, num: o.numberingSystem, year: year,
    };
  }

  function collectMisc() {
    intel.cn = safe(function () { var c = navigator.connection; return c ? { type: c.type || '', eff: c.effectiveType || '', rtt: c.rtt, down: c.downlink, save: c.saveData ? 1 : 0 } : {}; }, {});
    intel.pm = {};
    safe(function () { intel.pm.notif = window.Notification ? Notification.permission : ''; }, null);
  }

  async function collectPermissionsAndStorage() {
    try {
      if (navigator.permissions && navigator.permissions.query) { var p = await navigator.permissions.query({ name: 'notifications' }); intel.pm.perm = p.state; }
    } catch (e) { /* non pris en charge */ }
    intel.st = { ls: safe(function () { localStorage.setItem('nm_t', '1'); localStorage.removeItem('nm_t'); return 1; }, 0), idb: window.indexedDB ? 1 : 0, ck: navigator.cookieEnabled ? 1 : 0 };
    try { if (navigator.storage && navigator.storage.estimate) { var e = await navigator.storage.estimate(); intel.st.quota = e.quota; } } catch (e2) { /* ignoré */ }
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        var list = await navigator.mediaDevices.enumerateDevices();
        intel.md = { cam: list.filter(function (d) { return d.kind === 'videoinput'; }).length, mic: list.filter(function (d) { return d.kind === 'audioinput'; }).length, spk: list.filter(function (d) { return d.kind === 'audiooutput'; }).length };
      }
    } catch (e3) { /* ignoré */ }
  }

  /* ---------------------------------------------------------------- */
  /* Graphique : canevas, WebGL, audio, polices                          */
  /* ---------------------------------------------------------------- */

  function drawCanvas(canvas) {
    var c = canvas.getContext('2d');
    c.textBaseline = 'top';
    c.font = '14px "Arial"';
    c.fillStyle = '#f60';
    c.fillRect(125, 1, 62, 20);
    c.fillStyle = '#069';
    c.fillText('Skidz ☃ Cwm fjordbank glyphs vext quiz, 😃', 2, 15);
    c.fillStyle = 'rgba(102, 204, 0, 0.7)';
    c.font = '18pt serif';
    c.fillText('Skidz ☃ Cwm fjordbank', 4, 45);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgb(255,0,255)'; c.beginPath(); c.arc(50, 50, 50, 0, Math.PI * 2, true); c.closePath(); c.fill();
    c.fillStyle = 'rgb(0,255,255)'; c.beginPath(); c.arc(100, 50, 50, 0, Math.PI * 2, true); c.closePath(); c.fill();
    return canvas.toDataURL();
  }

  async function collectCanvas() {
    try {
      var a = document.createElement('canvas'); a.width = 280; a.height = 80;
      var b = document.createElement('canvas'); b.width = 280; b.height = 80;
      var d1 = drawCanvas(a);
      var d2 = drawCanvas(b);
      intel.cv = { ok: d1.length > 100 ? 1 : 0, h1: await digest(d1), h2: await digest(d2) };
    } catch (e) { intel.cv = { ok: 0, h1: '', h2: '' }; }
  }

  async function collectWebgl() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) { intel.gl = { ok: 0 }; return; }
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var params = [gl.MAX_TEXTURE_SIZE, gl.MAX_VIEWPORT_DIMS, gl.MAX_VERTEX_ATTRIBS, gl.MAX_VERTEX_UNIFORM_VECTORS, gl.MAX_FRAGMENT_UNIFORM_VECTORS, gl.MAX_VARYING_VECTORS, gl.ALIASED_LINE_WIDTH_RANGE, gl.ALIASED_POINT_SIZE_RANGE, gl.MAX_CUBE_MAP_TEXTURE_SIZE, gl.MAX_RENDERBUFFER_SIZE];
      var values = params.map(function (p) { var v = gl.getParameter(p); return v && v.length !== undefined ? Array.prototype.slice.call(v).join('x') : String(v); });
      var extensions = gl.getSupportedExtensions() || [];
      intel.gl = {
        ok: 1, vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        ver: gl.getParameter(gl.VERSION), sl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), mtex: gl.getParameter(gl.MAX_TEXTURE_SIZE), mvp: (gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [])[0],
        mva: gl.getParameter(gl.MAX_VERTEX_ATTRIBS), ext: extensions.length, hash: await digest(values.join('|') + '|' + extensions.join(',')), v2: safe(function () { return document.createElement('canvas').getContext('webgl2') ? 1 : 0; }, 0),
      };
    } catch (e) { intel.gl = { ok: 0 }; }
  }

  async function collectAudio() {
    try {
      var Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Context) { intel.au = { ok: 0, h: '' }; return; }
      var ctx = new Context(1, 5000, 44100);
      var osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 10000;
      var comp = ctx.createDynamicsCompressor();
      [['threshold', -50], ['knee', 40], ['ratio', 12], ['attack', 0], ['release', 0.25]].forEach(function (p) { if (comp[p[0]] && comp[p[0]].value !== undefined) comp[p[0]].value = p[1]; });
      osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
      var rendered = await withTimeout(ctx.startRendering(), 2500, null);
      if (!rendered) { intel.au = { ok: 0, h: '' }; return; }
      var data = rendered.getChannelData(0);
      var sum = 0;
      for (var i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
      intel.au = { ok: 1, h: await digest(sum.toFixed(8)) };
    } catch (e) { intel.au = { ok: 0, h: '' }; }
  }

  function collectFonts() {
    try {
      var candidates = ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Helvetica', 'Helvetica Neue', 'Menlo', 'Monaco', 'Geneva', 'Optima', 'Futura', 'Gill Sans', 'Avenir', 'San Francisco', 'Ubuntu', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Roboto', 'Open Sans', 'Cantarell', 'Droid Sans', 'Fira Sans', 'Source Sans Pro', 'MS Gothic', 'SimSun', 'Meiryo', 'Malgun Gothic', 'Microsoft YaHei', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Wingdings'];
      var bases = ['monospace', 'sans-serif', 'serif'];
      var text = 'mmmmmmmmmmlli1WwQq@#é中';
      var span = document.createElement('span');
      span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:72px;visibility:hidden;white-space:nowrap';
      span.textContent = text;
      document.body.appendChild(span);
      var baseline = {};
      bases.forEach(function (b) { span.style.fontFamily = b; baseline[b] = span.offsetWidth + 'x' + span.offsetHeight; });
      var mask = '';
      var count = 0;
      candidates.forEach(function (font) {
        var found = bases.some(function (b) { span.style.fontFamily = '"' + font + '",' + b; return span.offsetWidth + 'x' + span.offsetHeight !== baseline[b]; });
        mask += found ? '1' : '0';
        if (found) count++;
      });
      document.body.removeChild(span);
      intel.fo = { n: count, mask: mask };
    } catch (e) { intel.fo = { n: 0, mask: '' }; }
  }

  /* ---------------------------------------------------------------- */
  /* Appareil : identifiant conservé par ce navigateur                   */
  /* ---------------------------------------------------------------- */

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open('skidz', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('k'); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function idbGet() {
    var db = await idbOpen();
    return new Promise(function (resolve) {
      var req = db.transaction('k').objectStore('k').get('did');
      req.onsuccess = function () { resolve(req.result || ''); };
      req.onerror = function () { resolve(''); };
    });
  }

  async function idbSet(value) {
    var db = await idbOpen();
    return new Promise(function (resolve) {
      var tx = db.transaction('k', 'readwrite');
      tx.objectStore('k').put(value, 'did');
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  }

  async function collectDevice() {
    var found = [];
    var previous = '';
    var ls = safe(function () { return localStorage.getItem('nm_did') || ''; }, '');
    if (ls) { found.push('ls'); previous = ls; }
    var idb = '';
    try { idb = await withTimeout(idbGet(), 1500, ''); } catch (e) { idb = ''; }
    if (idb) { found.push('idb'); if (!previous) previous = idb; }
    /* On écrit l'identifiant du serveur dans les deux stockages (s'ils n'en ont pas) : prochaine visite, le même navigateur se reconnaît. */
    if (deviceId) {
      if (!ls) safe(function () { localStorage.setItem('nm_did', deviceId); }, null);
      if (!idb) { try { await withTimeout(idbSet(deviceId), 1500, null); } catch (e2) { /* ignoré */ } }
    }
    intel.dv = { id: previous, src: found };
  }

  /* ---------------------------------------------------------------- */
  /* Réseau : WebRTC (STUN intégré) et latence                           */
  /* ---------------------------------------------------------------- */

  async function collectRtc() {
    var out = { ok: 0, ms: 0, hosts: 0, mdns: 0, cand: [], err: '' };
    intel.rtc = out;
    var PC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!PC) { out.err = 'unsupported'; return; }
    var started = performance.now();
    try {
      var pc = new PC({ iceServers: stunServer ? [{ urls: 'stun:' + stunServer }] : [] });
      pc.createDataChannel('n');
      var done = new Promise(function (resolve) {
        pc.onicecandidate = function (event) {
          if (!event.candidate) { resolve(); return; }
          var m = /candidate:\S+ \d+ (\w+) \d+ (\S+) (\d+) typ (\w+)/.exec(event.candidate.candidate);
          if (!m) return;
          if (m[4] === 'host') { if (/\.local$/.test(m[2])) out.mdns++; else out.hosts++; }
          else if (m[4] === 'srflx') out.cand.push({ ip: m[2], port: parseInt(m[3], 10), t: 'srflx' });
        };
        pc.onicegatheringstatechange = function () { if (pc.iceGatheringState === 'complete') resolve(); };
      });
      await pc.setLocalDescription(await pc.createOffer());
      await withTimeout(done, 3500, null);
      out.ok = 1;
      pc.close();
    } catch (e) { out.err = String(e && e.name || e).slice(0, 40); }
    out.ms = Math.round(performance.now() - started);
  }

  async function collectLatency() {
    if (!pingUrl) return;
    var samples = [];
    for (var i = 0; i < 6; i++) {
      var s = performance.now();
      try { await fetch(pingUrl + '?i=' + i + '&r=' + Math.random().toString(36).slice(2), { cache: 'no-store', credentials: 'omit' }); samples.push(performance.now() - s); } catch (e) { break; }
    }
    samples = samples.slice(1).sort(function (a, b) { return a - b; });
    if (samples.length) intel.rt = { n: samples.length, min: Math.round(samples[0]), med: Math.round(samples[Math.floor(samples.length / 2)]), max: Math.round(samples[samples.length - 1]) };
  }

  /* ---------------------------------------------------------------- */
  /* Comportement                                                       */
  /* ---------------------------------------------------------------- */

  var beh = { moves: 0, dist: 0, speeds: [], turns: 0, keys: 0, keyTimes: [], clicks: 0, touches: 0, scrolls: 0, events: 0, trusted: 0, first: -1, focus: 0, hidden: 0, hiddenAt: 0, last: null, lastDir: null, ring: [] };

  function count(event) {
    beh.events++;
    if (event.isTrusted) beh.trusted++;
    if (beh.first < 0) beh.first = Math.round(performance.now() - T0);
  }

  document.addEventListener('pointermove', function (e) {
    count(e);
    beh.moves++;
    var now = performance.now();
    if (beh.last) {
      var dx = e.clientX - beh.last.x, dy = e.clientY - beh.last.y, d = Math.sqrt(dx * dx + dy * dy), dt = Math.max(1, now - beh.last.t);
      if (d >= 1) {
        beh.dist += d;
        if (beh.speeds.length < 400) beh.speeds.push(d / dt);
        var dir = Math.atan2(dy, dx);
        if (d > 3 && beh.lastDir !== null) { var diff = Math.abs(dir - beh.lastDir); if (diff > Math.PI) diff = 2 * Math.PI - diff; if (diff > 0.5) beh.turns++; }
        if (d > 3) beh.lastDir = dir;
      }
    }
    beh.last = { x: e.clientX, y: e.clientY, t: now };
    beh.ring.push({ x: e.clientX, y: e.clientY });
    if (beh.ring.length > 60) beh.ring.shift();
  }, { passive: true });
  document.addEventListener('keydown', function (e) { count(e); beh.keys++; if (beh.keyTimes.length < 200) beh.keyTimes.push(performance.now()); }, { passive: true });
  document.addEventListener('pointerdown', function (e) { count(e); beh.clicks++; }, { passive: true });
  document.addEventListener('touchstart', function (e) { count(e); beh.touches++; }, { passive: true });
  window.addEventListener('scroll', function (e) { count(e); beh.scrolls++; }, { passive: true });
  window.addEventListener('wheel', function (e) { count(e); beh.scrolls++; }, { passive: true });
  window.addEventListener('blur', function () { beh.focus++; });
  window.addEventListener('focus', function () { beh.focus++; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) beh.hiddenAt = performance.now(); else if (beh.hiddenAt) { beh.hidden += performance.now() - beh.hiddenAt; beh.hiddenAt = 0; } });

  function summarizeBehavior() {
    var mean = beh.speeds.length ? beh.speeds.reduce(function (a, b) { return a + b; }, 0) / beh.speeds.length : 0;
    var variance = beh.speeds.length ? beh.speeds.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / beh.speeds.length : 0;
    var path = 0;
    for (var i = 1; i < beh.ring.length; i++) { var dx = beh.ring[i].x - beh.ring[i - 1].x, dy = beh.ring[i].y - beh.ring[i - 1].y; path += Math.sqrt(dx * dx + dy * dy); }
    var straight = null;
    if (beh.ring.length > 5 && path > 0) { var ex = beh.ring[beh.ring.length - 1].x - beh.ring[0].x, ey = beh.ring[beh.ring.length - 1].y - beh.ring[0].y; straight = Math.min(1, Math.sqrt(ex * ex + ey * ey) / path); }
    var iv = [];
    for (var k = 1; k < beh.keyTimes.length; k++) iv.push(beh.keyTimes[k] - beh.keyTimes[k - 1]);
    var ivMean = iv.length ? iv.reduce(function (a, b) { return a + b; }, 0) / iv.length : 0;
    var ivSd = iv.length ? Math.sqrt(iv.reduce(function (a, b) { return a + (b - ivMean) * (b - ivMean); }, 0) / iv.length) : 0;
    return {
      n_move: beh.moves, dist: Math.round(beh.dist), spd: Math.round(mean * 1000) / 1000, spd_sd: Math.round(Math.sqrt(variance) * 1000) / 1000, turns: beh.turns, straight: straight === null ? null : Math.round(straight * 1000) / 1000,
      n_key: beh.keys, key_iv: Math.round(ivMean), key_sd: Math.round(ivSd), n_click: beh.clicks, n_touch: beh.touches, n_scroll: beh.scrolls,
      trusted: beh.events ? Math.round((beh.trusted / beh.events) * 1000) / 1000 : null, first: beh.first, focus: beh.focus, hidden: Math.round(beh.hidden), total: Math.round(performance.now() - T0), ev: beh.events,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Orchestration                                                      */
  /* ---------------------------------------------------------------- */

  async function step(id, label, fn) {
    mark(id, 'run');
    try {
      await fn();
      mark(id, 'ok');
    } catch (e) {
      mark(id, 'warn', label + ' (partial)');
    }
    progress();
  }

  async function collectAll() {
    intel.t = Date.now();
    await step('browser', 'Browser', async function () { collectNavigator(); collectScreen(); collectTimezone(); collectMisc(); await collectUserAgentData(); await collectPermissionsAndStorage(); });
    await step('device', 'Device', async function () { await Promise.all([collectCanvas(), collectWebgl(), collectAudio()]); collectFonts(); await collectDevice(); });
    await step('network', 'Connection', async function () { await Promise.all([withTimeout(collectRtc(), 5000, null), withTimeout(collectLatency(), 4000, null)]); });
    finished.collect = true;
    updateButton();
  }

  async function runPow() {
    mark('pow', 'run');
    try {
      powResult = await solvePow();
      finished.pow = true;
      mark('pow', 'ok');
    } catch (e) {
      mark('pow', 'warn', 'Proof of work unavailable');
      statusLine.textContent = 'Your browser does not support verification. Use a recent browser over HTTPS.';
    }
    updateButton();
  }

  consent.addEventListener('change', updateButton);

  form.addEventListener('submit', function (event) {
    if (submitting) return;
    if (!(finished.pow && finished.collect && consent.checked)) { event.preventDefault(); return; }
    submitting = true;
    intel.bh = summarizeBehavior();
    intel.dur = Math.round(performance.now() - T0);
    document.getElementById('pow').value = powResult;
    document.getElementById('tz').value = (intel.tz && intel.tz.name) || '';
    document.getElementById('tzo').value = String((intel.tz && intel.tz.off) || new Date().getTimezoneOffset());
    document.getElementById('intel').value = JSON.stringify(intel);
    button.disabled = true;
    statusLine.textContent = 'Redirecting to Discord…';
  });

  button.disabled = true;
  statusLine.textContent = 'Analyzing…';
  document.documentElement.classList.add('js');
  Promise.all([collectAll(), runPow()]).catch(function () { finished.collect = true; finished.pow = finished.pow || false; updateButton(); });
})();
