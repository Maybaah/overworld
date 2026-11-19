import { handleEventsRequest, type EventsEnv } from './eventsRelay';
import { handleSteamRequest, type SteamEnv } from './steamProxy';

export default {
  fetch(request: Request, env: SteamEnv & EventsEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/e') return handleEventsRequest(request, env);
    return handleSteamRequest(request, env);
  },
};
