/* Skidz Verify — src/web/pow.js
 * Preuve de travail : le navigateur doit trouver un nombre `n` tel que SHA-256(seed:n) commence par
 * `bits` zéros. Coût négligeable pour un humain (~1 s), prohibitif pour des milliers de requêtes
 * automatisées, sans aucun service tiers. Le navigateur la résout dans src/web/client/collector.js.
 */
'use strict';

const crypto = require('node:crypto');

function newSeed() {
  return crypto.randomBytes(16).toString('hex');
}

function leadingZeroBits(buffer) {
  let bits = 0;
  for (const byte of buffer) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

/** @returns {boolean} */
function verifyPow(seed, nonce, bits) {
  if (!bits) return true;
  if (!/^[0-9]{1,12}$/.test(String(nonce || ''))) return false;
  const digest = crypto.createHash('sha256').update(seed + ':' + nonce).digest();
  return leadingZeroBits(digest) >= bits;
}

/** Résout une épreuve (tests et outils) — le navigateur exécute l'équivalent en JavaScript. */
function solvePow(seed, bits) {
  for (let nonce = 0; ; nonce++) if (verifyPow(seed, String(nonce), bits)) return String(nonce);
}

module.exports = { newSeed, verifyPow, solvePow, leadingZeroBits };
