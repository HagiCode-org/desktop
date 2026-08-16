# Desktop cloud telemetry

Desktop cloud telemetry is disabled only when `HAGICODE_TELEMETRY_ENABLED=0`.
The public configuration is read in the main process:

- `HAGICODE_TELEMETRY_DEFAULT_REGION`: `cn` or `overseas` (default `overseas`)
- `HAGICODE_TELEMETRY_REGION_URL`: HTTPS endpoint returning `{ "region": "cn" | "overseas" }`
- `HAGICODE_TELEMETRY_SAMPLE_RATE`: value from `0` to `1` (default `0.1`)
- `HAGICODE_TELEMETRY_SESSION_REPLAY`: `1` enables replay where the regional provider supports it
- `HAGICODE_CLOUDCARE_APP_ID`, `HAGICODE_CLOUDCARE_CLIENT_TOKEN`, `HAGICODE_CLOUDCARE_SITE`
- `HAGICODE_SENTRY_DSN`, `HAGICODE_SENTRY_PROJECT_ID`
- `HAGICODE_POSTHOG_PUBLIC_KEY`, `HAGICODE_POSTHOG_HOST`, `HAGICODE_POSTHOG_PROJECT_ID`
- `HAGICODE_POSTHOG_DEFAULTS`, `HAGICODE_POSTHOG_PERSON_PROFILES` (`identified_only` or `always`)

PostHog defaults are the supplied public key, `https://us.i.posthog.com`,
`defaults: "2026-05-30"`, and `person_profiles: "identified_only"`.

DSNs, project IDs and client tokens are public configuration. PostHog Node
credentials and any other server-side token must be supplied only to the main
process runtime and must never be placed in preload or renderer variables.

The app starts with the build default or cached region, detects the region
asynchronously, and switches providers using `stop -> flush -> dispose -> init`.
Detection failures retain the current provider and do not block startup.

All events use the renderer `cloudTelemetry` bridge or the main-process
`TelemetryManager`. Known sensitive fields, raw prompts, credentials,
passwords, access tokens and raw business payloads are excluded before
submission. Provider failures are bounded and never fail a business operation.

China and overseas data are stored in their respective SaaS backends. Costs are
controlled with sampling and replay settings; the SaaS free tiers are the
initial target. China native minidump forwarding and hosted Redis presence
aggregation remain follow-up work.
