import { readServerConfig } from './config.js';
import { buildServer } from './server.js';

const config = readServerConfig();
const server = await buildServer({ ...config, logger: true });

const stop = async () => {
  await server.close();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await server.listen({ host: config.host, port: config.port });
