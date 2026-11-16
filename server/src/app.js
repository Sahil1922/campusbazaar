import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter } from './auth/routes.js';
import { profileRouter } from './profile/routes.js';
import { adminRouter } from './admin/routes.js';
import { categoriesRouter, listingsRouter, publicRouter } from './listings/routes.js';
import { messagesRouter } from './messages/routes.js';
import { reviewsRouter, userReviewsRouter } from './reviews/routes.js';
import { complaintsRouter, reportsRouter } from './moderation/routes.js';
import { auctionsRouter } from './auctions/routes.js';
import { notificationsRouter } from './notifications/routes.js';
import { errorHandler, notFoundHandler } from './http.js';

/** Serves the built React app and sends index.html for its client-side routes (e.g. /listings/5). */
function serveClientApp(app) {
  const indexFile = path.join(config.clientDistDir, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`SERVE_CLIENT is on but ${indexFile} does not exist. Run "npm run build" in client/ first.`);
  }
  // Built files under /assets have content hashes in their names, so they can be cached for a long time.
  app.use(
    express.static(config.clientDistDir, {
      index: false,
      setHeaders: (res, filePath) => {
        const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.get(/^\/(?!api(\/|$)|uploads(\/|$)|socket\.io(\/|$)).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // blob: is needed for photo previews on the Sell form.
          'img-src': ["'self'", 'data:', 'blob:'],
          // Only ask browsers to upgrade to HTTPS when the site is served over HTTPS.
          'upgrade-insecure-requests': config.clientOrigin.startsWith('https://') ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Listing photos. File names are random; content type was verified from the file bytes on upload.
  app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'ignore', fallthrough: true, maxAge: '7d' }));
  app.use('/uploads', (req, res) => res.status(404).end());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/public', publicRouter); // The only data available without signing in.
  app.use('/api/listings', listingsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/users', userReviewsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/complaints', complaintsRouter);
  app.use('/api/auctions', auctionsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api', notFoundHandler);

  if (config.serveClient) serveClientApp(app);

  app.use(errorHandler);
  return app;
}
