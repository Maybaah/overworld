# Contributing

Thanks for helping. There are two kinds of contribution: data corrections, which need no code, and code changes.

## Data corrections

The map is only as good as its sources, and the sources are sometimes wrong or silent. Three hand-kept files in `pipeline/data/` override them. Every entry needs an `evidenceUrl`: a page that actually states the fact, preferably the company's own site, otherwise its Wikipedia article. Search-result pages do not count.

### A studio is in the wrong city, or has no city

Add an entry to `pipeline/data/company-locations.json`:

```json
{
  "igdbCompanyId": 111,
  "name": "The Creative Assembly",
  "city": "Horsham",
  "country": "GB",
  "lat": 51.06314,
  "lng": -0.32757,
  "evidenceUrl": "https://en.wikipedia.org/wiki/The_Creative_Assembly"
}
```

- `igdbCompanyId` is the company's `id` in `web/public/data/companies.json` (the reports in `reports/` list it next to each name).
- Use the city where the studio was based while it made its games. If it moved, pick the long-time base and say so in the pull request.
- Take coordinates from a gazetteer such as GeoNames, not from memory.
- `reports/validation.md` lists the lead studios that still have no city: a good place to start.

### A game has the wrong lead studio

Add an entry to `pipeline/data/lead-overrides.json`:

```json
{
  "igdbGameId": 421,
  "game": "Final Fantasy IX",
  "igdbCompanyId": 250,
  "company": "Square",
  "evidenceUrl": "https://en.wikipedia.org/wiki/Final_Fantasy_IX"
}
```

Port studios, regional publishing branches and remaster studios are not lead studios. `reports/validation.md` lists the low-confidence picks.

### A company specialises in localization, QA, art or audio

Add an entry to `pipeline/data/company-specialties.json` with `specialty` set to `localization`, `qa`, `art` or `audio`. Only for companies whose main business is that service. Co-development studios stay out.

Keep each file sorted by its id field. Run `npm run pipeline -- --only=merge,validate` if you have the cached data; otherwise the maintainers will.

## Code changes

### Setup

```bash
npm install
npm run fixture
npm run dev
```

This runs the app on sample data with no API keys. See the README for real data, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is laid out.

### Before you open a pull request

```bash
npm run typecheck
npm test
npm run build
```

All three must pass. CI runs the same.

### Ground rules

- `shared/model.ts` is the contract between the pipeline and the app. Change it deliberately and in its own commit.
- Fetch stages only fetch; `merge` is a pure function with no network or file access, and every rule in it has a test.
- Every record keeps its source name and id. New data must be traceable the same way.
- Respect each source's terms and rate limits. No scraping. No API keys in code, tests, logs or commits.
- The app talks to the globe through the store (`web/src/data/store.ts`), not by reaching into the globe's internals.
- Role colors live in `web/src/data/roles.ts` and are chosen to be told apart by people with color-vision differences. Do not signal a role by color alone.
- Comments only where the logic is not obvious from the code.
- Small commits with one-line messages that describe the change.

### Reporting problems

Use the issue templates. For a wrong location or lead studio, the "Data correction" template asks for the evidence link up front.

For security problems, see [SECURITY.md](SECURITY.md).
