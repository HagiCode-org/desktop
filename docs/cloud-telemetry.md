# Desktop PostHog telemetry

Desktop telemetry uses PostHog only. It is enabled unless
`HAGICODE_TELEMETRY_ENABLED=0`.

- `HAGICODE_TELEMETRY_SAMPLE_RATE`: `0` to `1`, default `0.1`
- `HAGICODE_TELEMETRY_SESSION_REPLAY`: `1` enables replay
- `HAGICODE_TELEMETRY_DEBUG`: `1` enables diagnostics in production
- `HAGICODE_POSTHOG_PUBLIC_KEY`: public project key
- `HAGICODE_POSTHOG_HOST`: API host, default `https://t.hagicode.com` (HagiCode's managed proxy)
- `HAGICODE_POSTHOG_UI_HOST`: UI host used for PostHog links, default `https://us.posthog.com`
- `HAGICODE_POSTHOG_PROJECT_ID`: optional project identifier
- `HAGICODE_POSTHOG_DEFAULTS`: default `2026-05-30`
- `HAGICODE_POSTHOG_PERSON_PROFILES`: `identified_only` (default) or `always`;
  only the exact value `always` changes the default

Development builds print connection, lifecycle, queue, and event status logs.
Logs do not include keys, user IDs, or event payloads. PostHog Node credentials,
if later required, must remain in the main process and never enter renderer or
preload resources.

The main process sends the app lifecycle, error, heartbeat, upgrade, first
service start, and start-funnel events. The renderer sends the flow events
listed in the catalog below. Events are filtered, sampled, bounded, and flushed
during shutdown. PostHog is the only cloud telemetry backend. The only error
path is the catalogued `app_error` event; there is no free-form, performance, or
heartbeat channel.

## Event catalog

Events whose name is not in this table are dropped. Properties not declared for
an event are dropped, and string values must be one of the listed values. A
`semver` value must look like `1.2.3` or `1.2.3-beta.1`, with at most 64
characters. `duration` is a number of milliseconds, and `count` is a number of
dependencies.

| Event | Class | Properties | Emit site |
| --- | --- | --- | --- |
| `app_started` | always | `source`: `main_process`; `kind`: `startup`; `previousExit`: `normal`, `unclean`, `first_launch`, `unknown`; `sampled`: boolean; `sampleRate`: number from 0 to 1; `daysSinceFirstLaunch` (optional): whole number from 0 to 3650 | Main process, at startup after the single-instance lock is acquired |
| `main_view_entered` | always | `source`: `renderer`; `kind`: `main_view`; `duration` (optional): number from 0 to 24 h | Renderer `App.tsx` on main view entry; the main process adds `duration` from its own clock when the renderer does not send one |
| `app_exited` | always | `status`: `normal`; `duration`: number up to 365 days | Main process, first step of the quit sequence, before web service cleanup |
| `app_heartbeat` | always | `duration`: number up to 365 days | Main process, every six hours while the app runs |
| `app_upgraded` | always | `previousVersion`: semver | Main process at startup, only when the stored version differs from the running version |
| `app_error` | always | `kind`: `main_uncaught`, `main_rejection`, `renderer_gone`, `child_gone`, `renderer_uncaught`; `reason` (optional, only for `renderer_gone` and `child_gone`): `crashed`, `oom`, `killed`, `launch_failed`, `other` | Main process `uncaughtException` and `unhandledRejection`, Electron `render-process-gone` and `child-process-gone`, and the renderer error bridge |
| `view_entered` | session | `view`: `system`, `web`, `version`, `diagnostic`, `dependency-management`, `settings`, `subscription`, `turboengine`; `previousView`: `none`, `system`, `web`, `version`, `diagnostic`, `dependency-management`, `settings`, `subscription`, `turboengine` | Listener on `switchView`, skipped when the view is already active |
| `onboarding_step_entered` | always | `step`: `language_selection`, `welcome`, `legal_consent`, `download` | Listener on onboarding step change |
| `onboarding_legal_decided` | always | `decision`: `accepted`, `declined` | Listener on legal accept or decline success |
| `onboarding_skipped` | always | none | Listener on `skipOnboarding` success |
| `onboarding_download_finished` | always | `status`: `success`, `failure`; `duration`: number | Listener on `downloadPackage` outcome, once per request |
| `onboarding_completed` | always | none | Listener on `completeOnboarding` success |
| `web_service_start_requested` | always | `trigger`: `onboarding`, `home_button`, `auto`, `restart` | Renderer start thunks, the onboarding start handler, the runtime data path restart, and the automatic restart in the main process, when the request is made |
| `web_service_start_finished` | always | `status`: `success`, `failure`; `errorKind` (optional): `no_active_version`, `version_not_ready`, `dependencies_missing`, `other`; `duration`: number; `failedPhase` (optional, failures only): `idle`, `checking_version`, `checking_dependencies`, `spawning`, `waiting_listening`, `health_check`, `running`, `error`; `missingDependency` (optional, only with `errorKind` `dependencies_missing`): `dotnet-runtime`, `nodejs`, `java-runtime`, `claude-code`, `cli-tool`, `unknown`; `missingCount` (optional): whole number from 0 to 100 | `webServiceThunks.ts`, start outcome; the onboarding start handler for onboarding starts |
| `first_service_started` | always | `sinceFirstLaunch`: number up to 30 days | Main process, the first successful web service start on an installation |
| `web_service_stop_finished` | session | `status`: `success`, `failure`; `duration`: number | `webServiceThunks.ts`, stop outcome |
| `web_service_restart_finished` | session | `status`: `success`, `failure`; `duration`: number | `webServiceThunks.ts`, restart outcome |
| `version_install_finished` | always | `status`: `success`, `failure`; `mode`: `http-direct`, `source-fallback`; `duration`: number | `webServiceThunks.ts`, install outcome |
| `dependency_install_finished` | always | `status`: `success`, `failure`; `count`: number | Listener on dependency install outcomes |
| `language_changed` | session | `language`: `zh-CN`, `zh-Hant`, `en-US`, `ja-JP`, `ko-KR`, `de-DE`, `fr-FR`, `es-ES`, `pt-BR`, `ru-RU` | Listener on `changeLanguage` success |
| `package_source_switched` | session | `sourceKind`: `local-folder`, `http-index` | Listener on `switchSource` success |
| `service_region_changed` | session | `region`: `CN`, `INTERNATIONAL` | Listener on `setServiceRegion` success |
| `promote_link_opened` | session | `source`: `home_promote` | `HomePromotePanel.tsx`, after the link opens |
| `store_rating_prompt_actioned` | session | `action`: `rate` | `HomeStoreRatingPrompt.tsx`, after the store opens |
| `donation_item_actioned` | session | `action`: `purchase`, `dismiss`; `tier` (optional): `coffee`, `dinner`, `candy` | `HomeStoreDonationItem.tsx`, purchase start and dismiss |

## Dimensions

Every event carries three coarse context dimensions, resolved when the event is
sent, so a later event reflects a changed setting:

- `distribution`: `normal`, `fusion`, `steam`, or `win-store`
- `serviceRegion`: `CN` or `INTERNATIONAL`
- `language`: one of the supported Desktop language codes

A dimension that is unknown, cannot be read, or has a value outside its list is
omitted, and the event is still delivered. Events queued before the PostHog
provider is ready keep the dimensions that were current when they were queued.

## Geolocation

IP geolocation is off. `posthog-node` 5.54.1 defaults `disableGeoip` to `true`,
and Desktop does not override it, so events do not carry a country derived from
the IP address. Regional analysis uses `serviceRegion` and `language`. Enabling
geolocation needs a separate privacy decision.

## Sampling

- Each launch draws one random number at startup. Session-class events are sent
  only when the draw is below `HAGICODE_TELEMETRY_SAMPLE_RATE`, so a launch is
  either sampled in or out for all of them.
- `app_started` carries `sampled`, the result of that draw, and `sampleRate`,
  the configured rate that applied. Dashboards use them to correct session-class
  counts for sampled-in launches.
- Always-class events are sent whenever telemetry is enabled, including in
  launches sampled out. They cover app lifecycle, errors, heartbeats, onboarding
  steps and outcomes, web service start and the first successful start, version
  and dependency installs.
- `app_error` and `app_heartbeat` are always-class. They do not follow the launch
  decision.

## Previous exit

`app_started.previousExit` describes how the previous launch ended:

- `normal`: the previous launch cleared its run marker during the quit sequence.
- `unclean`: a run marker from an earlier launch was still present.
- `first_launch`: there is no run marker and no record of an earlier launch.
- `unknown`: the local store could not be read or written, or the installation
  predates this version, has an install ID, and has no launch history.

The run marker holds only its start time. It is written after the
single-instance lock is acquired, so a second instance that exits at once does
not write it or change the running instance's marker. It is cleared after
`app_exited` is queued. `unclean` covers crashes, forced termination, power loss
and system shutdown; these causes cannot be told apart. Run state is skipped
when telemetry is disabled.

## Exit and flush

The quit sequence runs the same way for window close, `app.quit`, `app.exit`,
and the tray exit action:

1. `app_exited` is queued. It is sent once per shutdown, even when several quit
   triggers fire.
2. Pending telemetry is flushed, with a time limit of about 1.5 seconds.
3. The run marker is cleared.
4. Web service cleanup runs. A failure or stall here does not stop the exit.
5. The telemetry client is closed, and then the app exits.

Exit telemetry never changes the quit outcome.

## Errors

`app_error` reports process-level failures without any message, stack, path,
URL, process type, or process name. The `kind` says where the failure was seen.
For `renderer_gone` and `child_gone`, `reason` maps from the Electron reason:
`clean-exit` is ignored; `crashed` maps to `crashed`; `oom` and memory-eviction
reasons map to `oom`; `killed` and `abnormal-exit` map to `killed`;
`launch-failed` maps to `launch_failed`; anything else maps to `other`.

At most five `app_error` events are sent per launch, counted across all kinds.
Later failures are not sent, and they do not delay or break the failing flow.
Local logging of these failures continues unchanged.

The untyped `reportError`, `recordPerformance`, and `heartbeat` channels have
been removed. No `desktop_error`, `desktop_performance`, or `desktop_heartbeat`
event is sent.

## Web service start funnel

- `web_service_start_requested` is sent when a start is requested, before its
  outcome is known. A request without a matching `web_service_start_finished`
  shows that the start was abandoned or stalled.
- `home_button` covers any user-requested start from the interface: the home
  start button, a start confirmed despite missing dependencies, and the tray
  start action.
- `onboarding` covers a start from the onboarding flow. This path emits both the
  requested and the finished event.
- `restart` covers a user restart from the interface, and a change of the
  runtime data path that restarts a running service.
- `auto` covers a start that no user requested. The only such path is the
  automatic restart after an unexpected backend exit, which the web service
  manager schedules itself. The renderer never starts the service without a user
  action.
- Starts that do not come from the Desktop interface are not part of the funnel.
  The non-interactive command mode runs without telemetry. The `onboardingHandlers.ts`
  and `webServiceHandlers.ts` modules are not registered, so their duplicate start
  handlers are not live.
- On failure, `failedPhase` is the last startup phase that finished before the
  failure. It is omitted when that phase is unknown. `missingDependency` names
  the category of the first missing dependency: `nodejs` for the Node/npm
  toolchain, `cli-tool` for required managed CLI packages, and `unknown` when
  the category cannot be determined. `missingCount` is the number of missing
  dependencies in that category. Both values are taken
  from enumerations, never from message text. Success carries none of these
  fields.

## Milestones and activity

- `app_heartbeat` is sent six hours after startup and then every six hours
  while the app runs. The timer does not keep the process alive, and it is
  stopped before `app_exited`.
- `first_service_started` is sent once per installation, on the first
  successful web service start. Its `sinceFirstLaunch` is measured from the first
  recorded launch and capped at 30 days. A failed start does not set the flag.
- `app_upgraded` is sent at startup when the stored version differs from the
  running version. It is not sent on first launch or when the stored value is not
  a valid version.
- `main_view_entered.duration` is measured from process start until the main
  view is available.
- `app_started.daysSinceFirstLaunch` is the number of whole days since the first
  recorded launch, for installation-age analysis. No system-version or hardware
  data is added.

## Version installs and onboarding downloads

- An interactive version install emits `version_install_finished` once for each
  outcome, with `status`, `mode`, and `duration`. The start time and mode are
  captured when the install starts, so clearing install-progress state cannot
  suppress the event. `mode` is the path that actually delivered the package:
  `http-direct` or `source-fallback`.
- An install during onboarding is reported as `onboarding_download_finished`
  instead. Onboarding does not emit `version_install_finished`.

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
3. Relaunch after quitting normally and confirm `app_started.previousExit` is
   `normal`. Then end a launch without quitting (kill the process), relaunch, and
   confirm `previousExit` is `unclean`.
4. Start the web service with a missing dependency and confirm
   `web_service_start_finished` carries `failedPhase` and `missingDependency`.
   Start it successfully and confirm `first_service_started` appears once.
5. Simulate an upgrade by editing the stored last version to an older semver
   value, relaunch, and confirm `app_upgraded` carries that `previousVersion`.
6. In PostHog live events, confirm each event arrives under its catalog name.
7. Confirm each event carries only the properties listed in the catalog table,
   and that every event carries `distribution`, `serviceRegion`, and `language`.
8. Confirm one stable `distinct_id` across relaunches.
9. Confirm no path, URL, message, stack, or token value appears in any event.
10. Confirm anonymous capture does not create person profiles unintentionally.
11. Record any name or property mismatch by correcting the catalog table and this file.

The six-hour heartbeat is covered by fake-timer tests and is not run live.
