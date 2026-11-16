export type SteamInput =
  | { kind: 'steamid'; id: string }
  | { kind: 'vanity'; name: string }
  | { kind: 'invalid'; reason: string };

const STEAM_ID = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;
const PROFILE_URL = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/(profiles|id)\/([^/?#\s]*)(?:[/?#].*)?$/i;

function steamId(id: string): SteamInput {
  return STEAM_ID.test(id)
    ? { kind: 'steamid', id }
    : { kind: 'invalid', reason: 'A SteamID64 is 17 digits and starts with 7656119.' };
}

function vanity(name: string): SteamInput {
  return VANITY.test(name)
    ? { kind: 'vanity', name }
    : {
        kind: 'invalid',
        reason: 'A custom profile name is 2 to 32 letters, digits, underscores or hyphens.',
      };
}

export function parseSteamInput(text: string): SteamInput {
  const value = typeof text === 'string' ? text.trim() : '';
  if (value === '') return { kind: 'invalid', reason: 'Enter a Steam profile link, a custom profile name or a SteamID64.' };

  const url = PROFILE_URL.exec(value);
  if (url) return url[1]!.toLowerCase() === 'profiles' ? steamId(url[2]!) : vanity(url[2]!);

  if (/^\d{17}$/.test(value)) return steamId(value);
  if (VANITY.test(value)) return vanity(value);

  return {
    kind: 'invalid',
    reason: 'Use a steamcommunity.com/id/ or steamcommunity.com/profiles/ link, a custom profile name or a 17-digit SteamID64.',
  };
}
