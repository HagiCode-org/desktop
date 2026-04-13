import { driver, type Config, type DriveStep, type Driver } from 'driver.js';
import type { TFunction } from 'i18next';

export const HOMEPAGE_TOUR_STORAGE_KEY = 'hagicode-desktop.homepage-tour';
export const HOMEPAGE_TOUR_DOM_STABLE_DELAY_MS = 160;
export const HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE = 'data-homepage-tour';
export const HOMEPAGE_TOUR_VARIANT_ATTRIBUTE = 'data-homepage-tour-variant';

export const HOMEPAGE_TOUR_SELECTORS = {
  hero: `[${HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE}="hero"]`,
  updateReminder: `[${HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE}="update-reminder"]`,
  serviceCard: `[${HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE}="service-card"]`,
  logAccess: `[${HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE}="log-access"]`,
  versionSection: `[${HOMEPAGE_TOUR_ANCHOR_ATTRIBUTE}="version-section"]`,
} as const;

const HOMEPAGE_TOUR_SNAPSHOT_VERSION = 1;
export const HOMEPAGE_TOUR_VARIANTS = {
  activeVersion: 'active-version',
  noVersionInstalled: 'no-version-installed',
} as const;

type HomepageTourVariant = typeof HOMEPAGE_TOUR_VARIANTS[keyof typeof HOMEPAGE_TOUR_VARIANTS];
type HomepageView = 'system' | 'web' | 'version' | 'diagnostic' | 'settings';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type DocumentLike = Pick<Document, 'querySelector'>;
type DriverFactory = (config?: Config) => Driver;

export interface HomepageTourSnapshot {
  version: number;
  completed: boolean;
  completedAt: string | null;
}

export interface HomepageTourResetResult {
  success: boolean;
  error?: string;
}

export interface BuildHomepageTourStepsOptions {
  t: TFunction<'common'>;
  documentRef?: DocumentLike;
}

export interface HomepageTourEligibilityOptions {
  currentView: HomepageView;
  onboardingActive: boolean;
  steps: DriveStep[];
  storage?: StorageLike | null;
}

export interface StartHomepageTourOptions extends BuildHomepageTourStepsOptions {
  steps?: DriveStep[];
  storage?: StorageLike | null;
  driverFactory?: DriverFactory;
  onDestroyed?: () => void;
}

export interface HomepageTourSession {
  driver: Driver;
  destroy: (options?: { markCompleted?: boolean }) => void;
  isActive: () => boolean;
}

const DEFAULT_HOMEPAGE_TOUR_SNAPSHOT: HomepageTourSnapshot = {
  version: HOMEPAGE_TOUR_SNAPSHOT_VERSION,
  completed: false,
  completedAt: null,
};

const HOMEPAGE_TOUR_STEP_ORDER = [
  {
    id: 'hero',
    selector: HOMEPAGE_TOUR_SELECTORS.hero,
    side: 'bottom' as const,
  },
  {
    id: 'updateReminder',
    selector: HOMEPAGE_TOUR_SELECTORS.updateReminder,
    side: 'bottom' as const,
  },
  {
    id: 'serviceCard',
    selector: HOMEPAGE_TOUR_SELECTORS.serviceCard,
    side: 'top' as const,
  },
  {
    id: 'logAccess',
    selector: HOMEPAGE_TOUR_SELECTORS.logAccess,
    side: 'top' as const,
  },
  {
    id: 'versionSection',
    selector: HOMEPAGE_TOUR_SELECTORS.versionSection,
    side: 'top' as const,
  },
] as const;

function getStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) {
    return storage;
  }

  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
}

function getDocument(documentRef?: DocumentLike): DocumentLike | null {
  if (documentRef) {
    return documentRef;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return document;
}

function cloneDefaultSnapshot(): HomepageTourSnapshot {
  return { ...DEFAULT_HOMEPAGE_TOUR_SNAPSHOT };
}

function isHomepageTourSnapshot(value: unknown): value is HomepageTourSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Record<string, unknown>;
  const completedAt = snapshot.completedAt;

  return snapshot.version === HOMEPAGE_TOUR_SNAPSHOT_VERSION
    && typeof snapshot.completed === 'boolean'
    && (typeof completedAt === 'string' || completedAt === null || typeof completedAt === 'undefined');
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getVersionStepTranslationKey(documentRef?: DocumentLike): string {
  const root = getDocument(documentRef)?.querySelector(HOMEPAGE_TOUR_SELECTORS.versionSection);
  const variant = root?.getAttribute(HOMEPAGE_TOUR_VARIANT_ATTRIBUTE) as HomepageTourVariant | null;

  if (variant === HOMEPAGE_TOUR_VARIANTS.activeVersion) {
    return 'system.homepageTour.steps.activeVersion';
  }

  return 'system.homepageTour.steps.noVersionInstalled';
}

function getStepTranslationKey(stepId: typeof HOMEPAGE_TOUR_STEP_ORDER[number]['id'], documentRef?: DocumentLike): string {
  if (stepId === 'versionSection') {
    return getVersionStepTranslationKey(documentRef);
  }

  return `system.homepageTour.steps.${stepId}`;
}

export function readHomepageTourSnapshot(storage?: StorageLike | null): HomepageTourSnapshot {
  const targetStorage = getStorage(storage);
  if (!targetStorage) {
    return cloneDefaultSnapshot();
  }

  try {
    const rawSnapshot = targetStorage.getItem(HOMEPAGE_TOUR_STORAGE_KEY);
    if (!rawSnapshot) {
      return cloneDefaultSnapshot();
    }

    const parsed = JSON.parse(rawSnapshot);
    if (!isHomepageTourSnapshot(parsed)) {
      targetStorage.removeItem(HOMEPAGE_TOUR_STORAGE_KEY);
      return cloneDefaultSnapshot();
    }

    return {
      version: parsed.version,
      completed: parsed.completed,
      completedAt: parsed.completedAt ?? null,
    };
  } catch {
    try {
      targetStorage.removeItem(HOMEPAGE_TOUR_STORAGE_KEY);
    } catch {
      // Ignore reset failures during fallback.
    }

    return cloneDefaultSnapshot();
  }
}

export function markHomepageTourCompleted(storage?: StorageLike | null): HomepageTourResetResult {
  const targetStorage = getStorage(storage);
  if (!targetStorage) {
    return { success: true };
  }

  try {
    targetStorage.setItem(HOMEPAGE_TOUR_STORAGE_KEY, JSON.stringify({
      version: HOMEPAGE_TOUR_SNAPSHOT_VERSION,
      completed: true,
      completedAt: new Date().toISOString(),
    } satisfies HomepageTourSnapshot));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: normalizeError(error),
    };
  }
}

export function resetHomepageTourState(storage?: StorageLike | null): HomepageTourResetResult {
  const targetStorage = getStorage(storage);
  if (!targetStorage) {
    return { success: true };
  }

  try {
    targetStorage.removeItem(HOMEPAGE_TOUR_STORAGE_KEY);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: normalizeError(error),
    };
  }
}

export function buildHomepageTourSteps({ t, documentRef }: BuildHomepageTourStepsOptions): DriveStep[] {
  const resolvedDocument = getDocument(documentRef);
  if (!resolvedDocument) {
    return [];
  }

  return HOMEPAGE_TOUR_STEP_ORDER.flatMap((stepDefinition) => {
    const element = resolvedDocument.querySelector(stepDefinition.selector);
    if (!element) {
      return [];
    }

    const translationKey = getStepTranslationKey(stepDefinition.id, resolvedDocument);

    return [{
      element: stepDefinition.selector,
      popover: {
        title: t(`${translationKey}.title`),
        description: t(`${translationKey}.description`),
        side: stepDefinition.side,
        align: 'center',
      },
    } satisfies DriveStep];
  });
}

export function shouldAutoStartHomepageTour({
  currentView,
  onboardingActive,
  steps,
  storage,
}: HomepageTourEligibilityOptions): boolean {
  if (currentView !== 'system' || onboardingActive || steps.length === 0) {
    return false;
  }

  return !readHomepageTourSnapshot(storage).completed;
}

export function startHomepageTour({
  t,
  steps,
  documentRef,
  storage,
  driverFactory,
  onDestroyed,
}: StartHomepageTourOptions): HomepageTourSession | null {
  const eligibleSteps = steps ?? buildHomepageTourSteps({ t, documentRef });
  if (eligibleSteps.length === 0) {
    return null;
  }

  const createDriver = driverFactory ?? driver;
  let shouldPersistOnDestroy = true;

  const tourDriver = createDriver({
    animate: true,
    allowClose: true,
    allowKeyboardControl: true,
    overlayClickBehavior: 'close',
    showProgress: true,
    smoothScroll: true,
    stagePadding: 12,
    stageRadius: 18,
    nextBtnText: t('system.homepageTour.buttons.next'),
    prevBtnText: t('system.homepageTour.buttons.previous'),
    doneBtnText: t('system.homepageTour.buttons.done'),
    steps: eligibleSteps,
    onDestroyed: () => {
      if (shouldPersistOnDestroy) {
        markHomepageTourCompleted(storage);
      }

      onDestroyed?.();
    },
  });

  tourDriver.drive();

  return {
    driver: tourDriver,
    destroy: ({ markCompleted = false } = {}) => {
      shouldPersistOnDestroy = markCompleted;
      if (tourDriver.isActive()) {
        tourDriver.destroy();
      }
    },
    isActive: () => tourDriver.isActive(),
  };
}
