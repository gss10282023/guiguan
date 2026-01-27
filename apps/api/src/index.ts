import Fastify from 'fastify';

const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok' }));

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
