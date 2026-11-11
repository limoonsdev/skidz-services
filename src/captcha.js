/* Skidz Verify — src/web/captcha.js
 * Captcha maison, sans aucun service tiers : un code de 5 caractères dérivé de la graine de session
 * (HMAC du secret du serveur), dessiné en SVG avec déformation et bruit, puis vérifié côté serveur
 * en temps constant. Le code n'est jamais présent dans la page : seule l'image le contient.
 */
'use strict';

const crypto = require('node:crypto');

/* Alphabet sans caractères ambigus (pas de I, O, 0, 1). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 5;
const WIDTH = 44 * LENGTH + 28;
const HEIGHT = 84;

/** Code attendu pour une session : stable, secret, dérivé de la graine de preuve de travail. */
function codeFor(secret, seed) {
  const digest = crypto.createHmac('sha256', secret).update('captcha|' + String(seed)).digest();
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[digest[i] % ALPHABET.length];
  return code;
}

/** Comparaison en temps constant (insensible à la casse et aux espaces). */
function matches(secret, seed, answer) {
  const expected = codeFor(secret, seed);
  const given = String(answer == null ? '' : answer).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

/** Générateur déterministe (mulberry32) : même session → même dessin, sans état côté serveur. */
function randomizer(seedText) {
  let state = Number.parseInt(crypto.createHash('sha256').update(String(seedText)).digest('hex').slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rand, min, max) => min + rand() * (max - min);

/** Image du captcha, en SVG inline (aucune requête, aucun fichier, aucun CDN). */
function svg(secret, seed) {
  const code = codeFor(secret, seed);
  const rand = randomizer('captcha-svg|' + String(seed));
  const glyphs = [];
  for (let i = 0; i < code.length; i += 1) {
    const x = 22 + i * 44 + between(rand, -3, 3);
    const y = 55 + between(rand, -5, 5);
    const rotate = between(rand, -16, 16);
    const size = Math.round(between(rand, 34, 42));
    glyphs.push(
      '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="' + size +
        '" font-weight="700" fill="#f2f2f6" transform="rotate(' + rotate.toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" text-anchor="middle">' +
        code[i] + '</text>'
    );
  }
  const noise = [];
  for (let i = 0; i < 6; i += 1) {
    noise.push(
      '<line x1="' + between(rand, 4, WIDTH - 4).toFixed(1) + '" y1="' + between(rand, 6, HEIGHT - 6).toFixed(1) + '" x2="' + between(rand, 4, WIDTH - 4).toFixed(1) +
        '" y2="' + between(rand, 6, HEIGHT - 6).toFixed(1) + '" stroke="#8b8b98" stroke-opacity="' + between(rand, 0.25, 0.5).toFixed(2) + '" stroke-width="' + between(rand, 1, 2).toFixed(1) + '"/>'
    );
  }
  for (let i = 0; i < 46; i += 1) {
    noise.push('<circle cx="' + between(rand, 3, WIDTH - 3).toFixed(1) + '" cy="' + between(rand, 3, HEIGHT - 3).toFixed(1) + '" r="' + between(rand, 0.6, 1.8).toFixed(1) + '" fill="#b9b9c6" fill-opacity="' + between(rand, 0.2, 0.55).toFixed(2) + '"/>');
  }
  return (
    '<svg class="captcha-img" xmlns="http://www.w3.org/2000/svg" width="' + WIDTH + '" height="' + HEIGHT + '" viewBox="0 0 ' + WIDTH + ' ' + HEIGHT + '" role="img" aria-label="Anti-bot image: type the five characters">' +
    '<rect width="' + WIDTH + '" height="' + HEIGHT + '" rx="12" fill="#101014"/>' +
    '<rect x="1" y="1" width="' + (WIDTH - 2) + '" height="' + (HEIGHT - 2) + '" rx="11" fill="none" stroke="#ffffff" stroke-opacity="0.10"/>' +
    noise.join('') + glyphs.join('') +
    '</svg>'
  );
}

module.exports = { codeFor, matches, svg, ALPHABET, LENGTH, WIDTH, HEIGHT };
