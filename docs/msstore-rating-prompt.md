# MS Store Day-7 Rating Prompt

The desktop home screen shows a Microsoft Store rating prompt directly below the
`HomeStoreOfferPanel`. The prompt is rendered by
`src/renderer/components/HomeStoreRatingPrompt.tsx` and is gated by the pure
function `shouldShowRatingPrompt` in
`src/renderer/lib/msstore-rating-prompt.ts`.

## Visibility gate

The prompt renders only when **both** conditions hold:

1. The app is running in the Windows Store distribution channel
   (`distributionState.winStoreMode === true`).
2. The persisted install timestamp is at least seven days before the current
   time (`now - installDate >= 7 days`).

In every other case the component returns `null` and renders nothing, so non
`win-store` channels (`normal` / `fusion` / `steam`) and fresh installs are
unaffected.

## No dismiss affordance

By design the prompt provides **no close, dismiss, or cancel control**. There is
no top-right `×`, no "don't show again", and no "remind me later". As long as the
visibility gate holds, the prompt stays on the home screen. The "Rate us" action
opens the Microsoft Store review page through the existing `openExternal` IPC and
shows a toast if the launch fails.

## Persistence

The install timestamp lives in `electron-store` under the `AppConfig` field:

```ts
msstoreRatingPrompt?: {
  installDate?: string; // ISO8601, written on first launch
};
```

- `installDate` is written exactly once by
  `ConfigManager.ensureMsstoreRatingPromptInstallDate()`, which is called during
  `app.whenReady()` in `src/main/main.ts` after the config manager is created.
- An existing `installDate` is never overwritten, so restarting the app never
  resets the seven-day countdown.

### Legacy / upgrading users

Users upgrading from a version that predates this feature will not have an
`installDate`. On the first launch of the new version the current time is
recorded, which effectively delays the prompt by seven days from that first
launch. This is the intended fallback; it avoids surprising long-time users with
an immediate prompt.

The persisted state is exposed to the renderer through the
`get-msstore-rating-prompt-state` IPC handler and the
`window.electronAPI.getMsstoreRatingPromptState()` preload bridge.

## Review URL

The review URL is derived from the existing store id constant in
`src/types/store-license.ts`:

```ts
HAGICODE_DESKTOP_WINDOWS_STORE_REVIEW_URL = HAGICODE_DESKTOP_WINDOWS_STORE_WEB_URL;
```

It uses the web detail page form so that it always falls back to a browser if a
native `ms-windows-store://` deeplink is unavailable on the current Windows
version.

## Theming

The prompt uses the `msstore-rating-prompt-*` CSS classes defined in
`src/renderer/index.css`. Light and dark theme variants are declared as CSS
custom properties so the prompt stays vivid and legible under both desktop
themes.

## i18n

All user-visible copy lives under the `pages.ratingPrompt.*` keys in
`src/renderer/i18n/locales/*/pages.yml` and is included via the standard i18n
generation flow.
