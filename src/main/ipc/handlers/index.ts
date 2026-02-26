/**
 * IPC Handler modules index
 *
 * This file exports all handler registration functions for easy importing in main.ts
 */

// Window handlers
export { registerWindowHandlers, initWindowHandlers, getMainWindow } from './windowHandlers.js';

// Server handlers
export { registerServerHandlers, initServerHandlers } from './serverHandlers.js';

// Web service handlers
export { registerWebServiceHandlers, initWebServiceHandlers } from './webServiceHandlers.js';

// Version handlers
export { registerVersionHandlers, initVersionHandlers } from './versionHandlers.js';

// Dependency handlers
export { registerDependencyHandlers, initDependencyHandlers } from './dependencyHandlers.js';

// Package source handlers
export { registerPackageSourceHandlers, initPackageSourceHandlers } from './packageSourceHandlers.js';

// License handlers
export { registerLicenseHandlers, initLicenseHandlers } from './licenseHandlers.js';

// Onboarding handlers
export { registerOnboardingHandlers, initOnboardingHandlers } from './onboardingHandlers.js';

// Data directory handlers
export { registerDataDirectoryHandlers, initDataDirectoryHandlers } from './dataDirectoryHandlers.js';

// Region handlers
export { registerRegionHandlers, initRegionHandlers } from './regionHandlers.js';

// LLM handlers
export { registerLlmHandlers, initLlmHandlers } from './llmHandlers.js';

// RSS handlers
export { registerRssHandlers, initRssHandlers } from './rssHandlers.js';

// Debug handlers
export { registerDebugHandlers, initDebugHandlers } from './debugHandlers.js';

// View handlers
export { registerViewHandlers, initViewHandlers } from './viewHandlers.js';

// Types
export type { HandlerSuccess, HandlerError, HandlerResponse, IpcHandler } from './types.js';
