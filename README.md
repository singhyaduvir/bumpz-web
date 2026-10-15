# RoadRate

RoadRate turns a single road photo into an **estimated asphalt PASER score** and shows confirmed locations on a U.S.-focused map. It is a community exploration tool, not a formal PASER survey or an engineering assessment.

## Local setup

1. Install Node.js 20.9+ and npm.
2. From this folder, install dependencies and copy the environment template:

   ```sh
   npm install
   cp .env.example .env.local
   ```

3. Create a Supabase project (or start a local Supabase stack), then add the project URL, anon key, and service-role key to `.env.local`. Keep the service-role key server-only; never prefix it with `NEXT_PUBLIC_`.
4. Apply [`supabase/migrations/202610150001_initial_schema.sql`](./supabase/migrations/202610150001_initial_schema.sql) using the Supabase SQL Editor or Supabase CLI. The migration creates the table, RLS policies, private `road-photos` bucket, indexes, and the flag-count function.
5. Add an Anthropic API key and model ID. Add a Mapbox access token for primary geocoding; if it is not configured, RoadRate uses the public Nominatim endpoint as a fallback. The basemap uses a public CARTO style and does not need a Mapbox key.
6. Set a random, private `IP_HASH_SECRET` (for example, `openssl rand -hex 32`).
7. Start the app:

   ```sh
   npm run dev
   ```

   Open http://localhost:3000.

The app needs working Supabase, Anthropic, and geocoding credentials for a complete submission. Missing configuration is reported by the server rather than replaced with fabricated ratings or pins.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For client integrations | Supabase anon key; all current database access is routed through server handlers |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase database and private Storage access |
| `ANTHROPIC_API_KEY` | Yes | Server-only vision model API key |
| `ANTHROPIC_MODEL` | Yes | Vision model name, e.g. `claude-sonnet-4-5` |
| `MAPBOX_ACCESS_TOKEN` | Recommended | Primary geocoder; Nominatim is used when no Mapbox token is configured |
| `IP_HASH_SECRET` | Yes | Secret salt for SHA-256 IP hashes used by the hourly submission limit |
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical local/deployment site URL |

## PASER source and rating scope

The rating scale references the official [PASER Manual: Asphalt](https://ltap.engr.wisc.edu/wp-content/uploads/2019/12/Asphalt-PASER_02_rev13.pdf), published by the Transportation Information Center at the University of Wisconsin–Madison (2013 revision). Rating details are on printed pages 15–25 (PDF pages 17–27). See [`lib/paser/definitions.ts`](./lib/paser/definitions.ts) for the version and source reference.

The manual is copyrighted; the application contains only short scale labels, not a transcription of the full rating descriptions. For a formally validated assessment workflow, consult the manual directly and have a trained PASER rater review the estimate.

The vision response is Zod-validated and uses integer ratings. Invalid JSON is retried once. Non-road, gravel, concrete, and inappropriate images are not rated. A low-confidence or ambiguous geocode does not create a map pin until a person confirms a corrected location. Uploaded images are checked by file signature, decoded and constrained with `sharp`, converted to JPEG, stripped of EXIF metadata, and resized to a 2048-pixel long edge before storage and analysis.

## Database and privacy

- Photos are held in a private Supabase Storage bucket. The app returns short-lived signed URLs from server routes.
- The `submissions` table has RLS enabled. Anonymous reads are limited to completed records and the column grant excludes `image_path` and `ip_hash`; direct anonymous inserts are limited to unlocated `uploaded` records. Application processing uses the server-side service-role key.
- The server stores only a salted SHA-256 hash of the request IP and limits each hash to 10 submissions per rolling hour.
- User submission IDs are kept in local browser storage for the “My roads” view; accounts are not part of v1.
- Face and license-plate blurring is not implemented in v1.

## Tests and development data

```sh
npm test
npm run lint
npm run build
```

The unit suite covers location parsing, PASER label lookup, and model-output validation. Five attributed sample photos and broad reference rating ranges are in [`tests/fixtures/roads/`](./tests/fixtures/roads/). Run the optional live vision regression (uses the configured Anthropic API and may incur API charges) with:

```sh
ROADRATE_RUN_VISION_FIXTURES=true npm test -- tests/road-fixtures.test.ts
```

For development data, set Supabase environment variables and run:

```sh
npm run seed
```

The seed script uploads the five normalized fixture photos and inserts completed sample submissions. It fails explicitly if a fixture or required Supabase setting is missing.
