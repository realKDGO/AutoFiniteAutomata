import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url) });
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port number.');
export const env = Object.freeze({ port, nodeEnv: process.env.NODE_ENV ?? 'development', corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });