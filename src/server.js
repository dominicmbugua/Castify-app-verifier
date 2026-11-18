import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { router } from './routes/verify.routes.js';
import { logger } from './utils/logger.js';
import { warmUp } from './utils/browser.js';
import { preconnect } from './utils/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const LG_ORIGIN = 'https://us.lgappstv.com';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', router);

app.listen(config.port, () => {
  logger.info(`Castify App Verifier running on http://localhost:${config.port}`);
  warmUp(); // launch the browser now so fallback checks (Amazon) aren't slow on first use

  // Keep a connection to LG's store open, so checks skip the slow connection setup.
  // To turn this off, delete the next two lines.
  preconnect(LG_ORIGIN);
  setInterval(() => preconnect(LG_ORIGIN, { quiet: true }), 45 * 1000).unref();
});