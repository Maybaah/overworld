import { handleSteamRequest, type SteamEnv } from './steamProxy';

export default {
  fetch(request: Request, env: SteamEnv): Promise<Response> {
    return handleSteamRequest(request, env);
  },
};
