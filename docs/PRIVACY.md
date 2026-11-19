# Privacy

Overworld counts how the site is used so its maintainers can see what people open, what breaks and how fast it loads. This page lists everything that is recorded. A fork records nothing unless its owner sets up their own backend ([SELF-HOSTING.md](SELF-HOSTING.md)).

## What is never recorded

- No cookies, no fingerprinting, nothing that links two visits. A tab gets a random id kept in `sessionStorage`; it is gone when the tab closes.
- No IP addresses. The relay (`web/server/eventsRelay.ts`) reads only the two-letter country Cloudflare derives from the request, and forwards nothing else about the connection.
- No search text. A search is recorded only when a result is picked, as that game's id and title.
- No Steam profile. My globe records only whether the lookup worked (or why not) and how many games it matched.
- No full referrer: only its host, for example `reddit.com`.

## What is recorded

Per tab: device class (phone, tablet, desktop, from the screen size), country, referrer host, UTM tags, which kind of link it opened (home page, game, place or mode) and the site's version.

Per event, with only these fields (the database drops anything else, `supabase/migrations/0001_telemetry.sql`):

| Event | Fields |
| --- | --- |
| `ready` | milliseconds until the globe showed |
| `game_open` | game id and title |
| `search` | the picked game's id and title |
| `place_open` | country, city or studio name |
| `mode` | the mode opened |
| `insights_tab` | the tab opened |
| `year_play` | the year the timeline started from |
| `share` | copy link, download or system share; and whether it was a game, My globe or a guess result |
| `myglobe` | outcome and number of matched games |
| `error` | where it happened and the message, with URLs and decimal numbers masked |

## How long it is kept

Raw events and tabs are deleted after 48 hours. Only hourly counts remain after that (`event_hours`), with no tab ids.

## Who can read it

Only the email addresses on the admin list, signed in on `/admin.html`. Every table has row-level security on and all privileges revoked; the public key can call `log_events` and nothing else.

## Turning it off

- Open any page with `?noanalytics=1` and nothing is sent for the rest of that tab.
- Browsers that send Do Not Track or Global Privacy Control send nothing.
- Development builds, automated browsers and local hosts never send anything.
