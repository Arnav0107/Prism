import { loadConfig } from './config.js';
import { PrismKeeper } from './keeper.js';
import { logger } from './logger.js';

async function main() {
  try {
    const config = await loadConfig();
    const keeper = new PrismKeeper(config);

    const shutdown = async () => {
      logger.info('Signal received. Initiating graceful shutdown...');
      await keeper.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());

    await keeper.start();
  } catch (err) {
    logger.error('Fatal initialization error in Prism Keeper:', err);
    process.exit(1);
  }
}

void main();
