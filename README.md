# Skidz Verify Server — relais public Render

Petit service HTTP sans Discord, conçu pour Render. Il sert la page de vérification, exécute les contrôles navigateur
(empreintes, WebRTC, latence, comportement, preuve de travail, captcha maison), puis envoie le rapport **signé** au
backend Verify. Le backend garde la base SQLite, l'analyse réseau, la décision et OAuth2.

```
Navigateur ── HTTPS ──> Render /v/<jeton>     page + collecte
                             │ POST signé
                             ▼
                       Backend /relay/challenge
                             │ { redirectUrl }
                             ▼
Navigateur ── Discord OAuth2 ──> Render /callback
                             │ POST signé
                             ▼
                       Backend /relay/callback ── page HTML
```

## Déploiement Render

1. Crée un **Web Service** depuis ce dépôt séparé.
2. `Root Directory` : la racine du dépôt (`SkidzVerifyServer`).
3. Build : `npm install` · Start : `npm start`.
4. Ajoute les variables de `.env.example` dans **Environment**.
5. Dans le Developer Portal Discord → OAuth2 → Redirects, ajoute exactement
   `<PUBLIC_URL>/callback`.

Render fournit `PORT` et `RENDER_EXTERNAL_URL`. `PUBLIC_URL` est donc détectée automatiquement : aucune adresse Render
n'est codée dans le service. Pour un domaine personnalisé, renseigne seulement `PUBLIC_URL`.

`BACKEND_URL` doit pointer vers l'API Verify (`https://limoon-space.cloud`), être joignable depuis Render et exposer les
deux routes ci-dessous. Le port du backend n'a pas besoin d'être public pour les navigateurs : seul Render l'appelle.
Aucun domaine n'est codé dans les sources.

## Variables

| Variable | Rôle |
| --- | --- |
| `PUBLIC_URL` | Facultatif : URL publique personnalisée. Sinon détectée depuis `RENDER_EXTERNAL_URL`. |
| `BACKEND_URL` | Base du backend Verify, ex. `https://limoon-space.cloud`. |
| `RELAY_SECRET` | Secret partagé, 32 caractères minimum. Doit être identique à `VERIFY_RELAY_SECRET` côté bot. |
| `TRUST_PROXY_HOPS` | `1` sur Render : lit l'adresse du visiteur dans `X-Forwarded-For`. |
| `STUN_SERVER` | Facultatif, `hôte:port` du STUN UDP du backend. |
| `IP_RETENTION_DAYS`, `DEVICE_RETENTION_DAYS`, `LOG_RETENTION_DAYS` | Valeurs affichées par `/privacy`. |

## Jeton de session

Le backend signe un jeton avec `RELAY_SECRET` :

```js
const { signRelayToken } = require('@skidz/shared');
const token = signRelayToken({
  n: session.nonce,
  g: guildId,
  u: userId,
  s: powSeed,
  b: powBits,
  gn: guildName,   // facultatif, affiché sur la page
  un: username,    // facultatif
}, relaySecret, ttlSeconds);
```

Le relais vérifie la signature et l'expiration, puis construit l'URL `<PUBLIC_URL>/v/<token>`.

## Contrat backend

Chaque requête est un `POST application/json` avec :

```
X-Skidz-Timestamp: <secondes Unix>
X-Skidz-Signature: HMAC-SHA256(secret, timestamp + "." + corps brut)
```

Le backend doit recalculer la signature sur le corps **brut**, refuser un timestamp de plus de 300 secondes, puis
désérialiser.

### `POST /relay/challenge`

```json
{
  "token": "<jeton signé>",
  "ip": "81.2.3.4",
  "deviceId": "…",
  "cookie": "…",
  "receivedAt": 1760000000000,
  "form": { "pow": "…", "tz": "Europe/Paris", "tzo": -60, "intel": "{…}", "captcha": "ABCDE" },
  "headers": { "user-agent": "…", "accept-language": "…", "x-forwarded-for": "81.2.3.4" }
}
```

Réponse attendue :

```json
{ "redirectUrl": "https://discord.com/oauth2/authorize?…", "cookie": "nm_did=…; …" }
```

Erreur logique :

```json
{ "error": { "status": 400, "title": "Check failed", "message": "…" } }
```

### `POST /relay/callback`

```json
{
  "ip": "81.2.3.4",
  "receivedAt": 1760000000000,
  "query": { "code": "…", "state": "…", "error": "", "error_description": "" },
  "headers": { "user-agent": "…" }
}
```

Réponse attendue :

```json
{ "status": 200, "html": "<!doctype html>…", "csp": "default-src 'none'; …", "cookie": null }
```

Le relais renvoie ce HTML tel quel, avec la CSP fournie. Le backend peut donc réutiliser ses pages de résultat.

## Côté bot

Dans le `.env` racine :

```env
VERIFY_RELAY_URL=https://<ton-service>.onrender.com
VERIFY_RELAY_SECRET=le-meme-secret-que-render
VERIFY_PORT=3000
VERIFY_HOST=0.0.0.0
```

Le bot expose `/relay/challenge` et `/relay/callback` sur son port local. `VERIFY_RELAY_URL` devient l'URL publique des
panneaux et du retour OAuth2. `VERIFY_PUBLIC_URL` reste accepté pour un serveur local ou un ancien déploiement direct.

## Sécurité

- Aucun secret dans les URL, les pages ou les journaux.
- Toutes les valeurs affichées sont échappées ; CSP à nonce, aucun CDN, polices Inter locales.
- Le relais n'écrit aucune donnée persistante : il ne garde ni adresse, ni rapport, ni cookie au-delà de la requête.
- Le cookie `nm_did` est `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, et ne contient qu'un identifiant aléatoire.
- Un corps de formulaire est limité à 96 Ko, un rapport navigateur à 64 Ko.
