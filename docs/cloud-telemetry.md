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

The main process sends `app_started` and `app_exited`; the renderer sends the
other events in the catalog. Events are filtered, sampled, bounded, and flushed
during shutdown. PostHog is the only cloud telemetry backend.

## Event catalog

Events whose name is not in this table are dropped. Properties not declared for
an event are dropped, and string values must be one of the listed values.
`duration` is a number of milliseconds, and `count` is a number of dependencies.

| Event | Class | Properties | Emit site |
| --- | --- | --- | --- |
| `app_started` | always | `source`: `main_process`; `kind`: `startup` | Main process, at startup |
| `main_view_entered` | always | `source`: `renderer`; `kind`: `main_view` | Renderer `App.tsx`, on main view entry |
| `app_exited` | always | `status`: `normal`; `duration`: number | Main process, before telemetry close on shutdown |
| `view_entered` | session | `view`: `system`, `web`, `version`, `diagnostic`, `dependency-management`, `settings`, `subscription`, `turboengine`; `previousView`: `none`, `system`, `web`, `version`, `diagnostic`, `dependency-management`, `settings`, `subscription`, `turboengine` | Listener on `switchView`, skipped when the view is already active |
| `onboarding_step_entered` | always | `step`: `language_selection`, `welcome`, `legal_consent`, `download` | Listener on onboarding step change |
| `onboarding_legal_decided` | always | `decision`: `accepted`, `declined` | Listener on legal accept or decline success |
| `onboarding_skipped` | always | none | Listener on `skipOnboarding` success |
| `onboarding_download_finished` | always | `status`: `success`, `failure`; `duration`: number | Listener on `downloadPackage` outcome, once per request |
| `onboarding_completed` | always | none | Listener on `completeOnboarding` success |
| `web_service_start_finished` | always | `status`: `success`, `failure`; `errorKind` (optional): `no_active_version`, `version_not_ready`, `dependencies_missing`, `other`; `duration`: number | `webServiceThunks.ts`, start outcome |
| `web_service_stop_finished` | session | `status`: `success`, `failure`; `duration`: number | `webServiceThunks.ts`, stop outcome |
| `web_service_restart_finished` | session | `status`: `success`, `failure`; `duration`: number | `webServiceThunks.ts`, restart outcome |
| `version_install_finished` | always | `status`: `success`, `failure`; `mode`: `http-direct`, `source-fallback`; `duration`: number | `webServiceThunks.ts`, install outcome |
| `dependency_install_finished` | session | `status`: `success`, `failure`; `count`: number | Listener on dependency install outcomes |
| `language_changed` | session | `language`: `zh-CN`, `zh-Hant`, `en-US`, `ja-JP`, `ko-KR`, `de-DE`, `fr-FR`, `es-ES`, `pt-BR`, `ru-RU` | Listener on `changeLanguage` success |
| `package_source_switched` | session | `sourceKind`: `local-folder`, `http-index` | Listener on `switchSource` success |
| `service_region_changed` | session | `region`: `CN`, `INTERNATIONAL` | Listener on `setServiceRegion` success |
| `promote_link_opened` | session | `source`: `home_promote` | `HomePromotePanel.tsx`, after the link opens |
| `store_rating_prompt_actioned` | session | `action`: `rate` | `HomeStoreRatingPrompt.tsx`, after the store opens |
| `donation_item_actioned` | session | `action`: `purchase`, `dismiss`; `tier` (optional): `coffee`, `dinner`, `candy` | `HomeStoreDonationItem.tsx`, purchase start and dismiss |

## Sampling

- Each launch draws one random number at startup. Session-class events are sent
  only when the draw is below `HAGICODE_TELEMETRY_SAMPLE_RATE`, so a launch is
  either sampled in or out for all of them.
- Always-class events are sent whenever telemetry is enabled, including in
  launches sampled out. They cover app lifecycle, onboarding steps and
  outcomes, web service start, and version install.
- Errors, performance samples, and heartbeats follow the same launch decision
  as session-class events.

## Anonymous install ID

- A random UUID is generated on first launch and stored as `anonymousInstallId`
  in the Desktop config store. Later launches reuse it unchanged.
- The main process sets it as the PostHog distinct ID at startup, so events from
  one installation share one ID across relaunches.
- It is not derived from host name, user name, hardware, network address, or
  account or license data.
- If the ID cannot be read or stored, that launch uses the per-launch session ID
  and startup continues.
- The ID is not written to logs, is not returned by the config read path used by
  the renderer, and is not included in diagnostic output.
- Person profiles follow `HAGICODE_POSTHOG_PERSON_PROFILES`, default
  `identified_only`.

## Never sent

Behavior events never include:

- user prompts, file system paths, folder names, or URLs, including package index URLs
- account, license, or subscription identifiers
- credentials, tokens, authorization headers, or API keys
- free-text error messages; failure reasons appear only as declared `errorKind` values
- host name, user name, hardware, or network identifiers
- property values outside their declared list, or properties not declared for the event

## PostHog verification checklist

1. Run a dev build with `HAGICODE_TELEMETRY_DEBUG=1` and `HAGICODE_TELEMETRY_SAMPLE_RATE=1`.
2. Perform each flow once: launch the app, switch views, complete onboarding
   (language, welcome, legal, download, complete), skip onboarding in a second
   run, start, stop, and restart the web service, install a version, change the
   language, package source, and service region, open the promote link, use the
   rating prompt, and use a donation item.
3. In PostHog live events, confirm each event arrives under its catalog name.
4. Confirm each event carries only the properties listed in the catalog table.
5. Confirm one stable `distinct_id` across relaunches.
6. Confirm no path, URL, message, or token value appears in any event.
7. Confirm anonymous capture does not create person profiles unintentionally.
8. Record any name or property mismatch by correcting the catalog table and this file.
