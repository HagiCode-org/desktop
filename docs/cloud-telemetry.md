# Desktop PostHog telemetry

Desktop telemetry uses PostHog only. It is enabled unless
`HAGICODE_TELEMETRY_ENABLED=0`.

- `HAGICODE_TELEMETRY_SAMPLE_RATE`: `0` to `1`, default `0.1`
- `HAGICODE_TELEMETRY_SESSION_REPLAY`: `1` enables replay
- `HAGICODE_TELEMETRY_DEBUG`: `1` enables diagnostics in production
- `HAGICODE_POSTHOG_PUBLIC_KEY`: public project key
- `HAGICODE_POSTHOG_HOST`: default `https://us.i.posthog.com`
- `HAGICODE_POSTHOG_PROJECT_ID`: optional project identifier
- `HAGICODE_POSTHOG_DEFAULTS`: default `2026-05-30`
- `HAGICODE_POSTHOG_PERSON_PROFILES`: `identified_only` or `always`

Development builds print connection, lifecycle, queue, and event status logs.
Logs do not include keys, user IDs, or event payloads. PostHog Node credentials,
if later required, must remain in the main process and never enter renderer or
preload resources.

The main process sends `app_started`; the renderer sends
`main_view_entered`. Events are filtered, sampled, bounded, and flushed during
shutdown. PostHog is the only cloud telemetry backend.
