import dotenv from 'dotenv';
import { app } from './app';
import { logger } from './utils/logger';

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`PayPilot Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  logger.info(`API v1 base url: http://localhost:${PORT}/api/v1`);
});
