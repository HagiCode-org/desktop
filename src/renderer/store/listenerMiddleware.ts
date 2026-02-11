import { createListenerMiddleware } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './index';

/**
 * Listener Middleware for handling side effects based on state changes
 * This replaces Redux Saga's event watching capabilities
 */
const listenerMiddleware = createListenerMiddleware<RootState, AppDispatch>({
  // Extra options can be added here if needed
});

export const startListening = listenerMiddleware.startListening;
export const stopListening = listenerMiddleware.stopListening;

export default listenerMiddleware;
