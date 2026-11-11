/* Skidz Verify Server — src/index.js
 * Point d'entrée Render. Port fourni par la plateforme, aucune dépendance Discord.
 */
'use strict';

try {
  const { loadConfig } = require('./config');
  const { createRelayServer } = require('./server');
  const config = loadConfig();
  const relay = createRelayServer(config);

  relay
    .listen()
    .then((address) => {
      console.log('[relay] verification page: ' + config.publicUrl + ' (listening on port ' + address.port + ')');
      console.log('[relay] backend: ' + config.backendUrl);
      console.log('[relay] OAuth2 redirect URL: ' + config.publicUrl + '/callback');
    })
    .catch((error) => {
      console.error('[relay] could not start: ' + error.message);
      process.exit(1);
    });

  const shutdown = () => {
    relay.close().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error('\n[relay] ' + error.message + '\n');
  process.exit(1);
}
