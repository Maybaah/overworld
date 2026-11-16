import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { handleSteamRequest } from './steamProxy';

function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? 'localhost';
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress);
  }
  return new Request(`http://${host}${req.url ?? '/'}`, { method: req.method ?? 'GET', headers });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function steamProxyPlugin({ envDir }: { envDir: string }): Plugin {
  let key: string | undefined;
  let allowedOrigin: string | undefined;

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/steam/')) {
      next();
      return;
    }
    handleSteamRequest(toRequest(req), { STEAM_API_KEY: key, ALLOWED_ORIGIN: allowedOrigin })
      .then((r) => send(res, r))
      .catch(() => {
        res.statusCode = 502;
        res.setHeader('content-type', 'application/json');
        res.end('{"error":"steam_unavailable"}');
      });
  };

  return {
    name: 'overworld-steam-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, envDir, ['STEAM_API_KEY', 'ALLOWED_ORIGIN']);
      key = env.STEAM_API_KEY || undefined;
      allowedOrigin = env.ALLOWED_ORIGIN || undefined;
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
