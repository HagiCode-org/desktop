import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DriveStep } from 'driver.js';
import {
  buildHomepageTourSteps,
  HOMEPAGE_TOUR_SELECTORS,
  HOMEPAGE_TOUR_STORAGE_KEY,
  HOMEPAGE_TOUR_VARIANTS,
  markHomepageTourCompleted,
  readHomepageTourSnapshot,
  resetHomepageTourState,
  shouldAutoStartHomepageTour,
  startHomepageTour,
} from '../homepageInteractiveTour.js';

type StorageRecord = Record<string, string>;
const translate = ((key: string) => key) as any;

function createStorage(initial: StorageRecord = {}) {
  const data = new Map(Object.entries(initial));
  let removeCount = 0;

  return {
    storage: {
      getItem(key: string) {
        return data.has(key) ? data.get(key)! : null;
      },
      setItem(key: string, value: string) {
        data.set(key, value);
      },
      removeItem(key: string) {
        removeCount += 1;
        data.delete(key);
      },
    },
    getRaw(key: string) {
      return data.get(key) ?? null;
    },
    getRemoveCount() {
      return removeCount;
    },
  };
}

function createElement(attributes: Record<string, string> = {}) {
  return {
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
  } as unknown as Element;
}

function createDocument(selectors: Record<string, Element | null>) {
  return {
    querySelector(selector: string) {
      return selectors[selector] ?? null;
    },
  };
}

describe('homepageInteractiveTour', () => {
  it('falls back safely when the stored snapshot is invalid JSON', () => {
    const storageRef = createStorage({
      [HOMEPAGE_TOUR_STORAGE_KEY]: '{broken-json',
    });

    const snapshot = readHomepageTourSnapshot(storageRef.storage);

    assert.deepEqual(snapshot, {
      version: 1,
      completed: false,
      completedAt: null,
    });
    assert.equal(storageRef.getRaw(HOMEPAGE_TOUR_STORAGE_KEY), null);
    assert.equal(storageRef.getRemoveCount(), 1);
  });

  it('persists completion and reset state in local storage', () => {
    const storageRef = createStorage();

    const markResult = markHomepageTourCompleted(storageRef.storage);
    assert.equal(markResult.success, true);

    const storedSnapshot = JSON.parse(storageRef.getRaw(HOMEPAGE_TOUR_STORAGE_KEY) ?? 'null');
    assert.equal(storedSnapshot.completed, true);
    assert.equal(typeof storedSnapshot.completedAt, 'string');

    const resetResult = resetHomepageTourState(storageRef.storage);
    assert.equal(resetResult.success, true);
    assert.equal(storageRef.getRaw(HOMEPAGE_TOUR_STORAGE_KEY), null);
  });

  it('filters missing steps and selects the active version branch when available', () => {
    const documentRef = createDocument({
      [HOMEPAGE_TOUR_SELECTORS.hero]: createElement(),
      [HOMEPAGE_TOUR_SELECTORS.updateReminder]: createElement(),
      [HOMEPAGE_TOUR_SELECTORS.serviceCard]: createElement(),
      [HOMEPAGE_TOUR_SELECTORS.logAccess]: createElement(),
      [HOMEPAGE_TOUR_SELECTORS.versionSection]: createElement({
        'data-homepage-tour-variant': HOMEPAGE_TOUR_VARIANTS.activeVersion,
      }),
    });

    const steps = buildHomepageTourSteps({
      t: translate,
      documentRef,
    });

    assert.equal(steps.length, 5);
    assert.equal(steps[0]?.element, HOMEPAGE_TOUR_SELECTORS.hero);
    assert.equal(steps[1]?.element, HOMEPAGE_TOUR_SELECTORS.updateReminder);
    assert.equal(steps[2]?.element, HOMEPAGE_TOUR_SELECTORS.serviceCard);
    assert.equal(steps[4]?.popover?.title, 'system.homepageTour.steps.activeVersion.title');
  });

  it('suppresses auto-start after completion and marks close/finish flows as completed', () => {
    const storageRef = createStorage();
    const steps: DriveStep[] = [{ element: HOMEPAGE_TOUR_SELECTORS.hero }];
    let destroyedHandler: (() => void) | undefined;
    let stubDriver: any;

    const session = startHomepageTour({
      t: translate,
      steps,
      storage: storageRef.storage,
      driverFactory: (config) => {
        destroyedHandler = config?.onDestroyed ? () => config.onDestroyed?.(undefined, steps[0]!, { config, state: {}, driver: stubDriver }) : undefined;
        stubDriver = {
          drive() {},
          destroy() {
            destroyedHandler?.();
          },
          isActive() {
            return true;
          },
          refresh() {},
          setConfig() {},
          setSteps() {},
          getConfig() {
            return {};
          },
          getState() {
            return undefined;
          },
          getActiveIndex() {
            return undefined;
          },
          isFirstStep() {
            return true;
          },
          isLastStep() {
            return true;
          },
          getActiveStep() {
            return undefined;
          },
          getActiveElement() {
            return undefined;
          },
          getPreviousElement() {
            return undefined;
          },
          getPreviousStep() {
            return undefined;
          },
          moveNext() {},
          movePrevious() {},
          moveTo() {},
          hasNextStep() {
            return false;
          },
          hasPreviousStep() {
            return false;
          },
          highlight() {},
        };
        return stubDriver;
      },
    });

    assert.ok(session);
    assert.equal(readHomepageTourSnapshot(storageRef.storage).completed, true);
    session?.driver.destroy();
    assert.equal(readHomepageTourSnapshot(storageRef.storage).completed, true);
    assert.equal(shouldAutoStartHomepageTour({ currentView: 'system', onboardingActive: false, steps, storage: storageRef.storage }), false);
  });
});
