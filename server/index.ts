import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { logger } from './utils/logger';
import { registerCallProvider } from './services/calls/CallProvider';
import { ExotelProvider } from './services/calls/providers/ExotelProvider';

const PORT = process.env.PORT || 5000;

function configureCallProvider(): void {
  const provider = (process.env.CALL_PROVIDER || '').toLowerCase();

  if (provider === 'exotel') {
    registerCallProvider(new ExotelProvider());
    logger.info('Call provider configured: Exotel');
    return;
  }

  throw new Error(
    `Unsupported or missing CALL_PROVIDER: "${process.env.CALL_PROVIDER}". ` +
    'Set CALL_PROVIDER=EXOTEL in .env.',
  );
}

configureCallProvider();

app.listen(PORT, () => {
  logger.info(
    `PayPilot Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`,
  );
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  logger.info(`API v1 base url: http://localhost:${PORT}/api/v1`);
});