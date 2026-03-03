import { fetchRemoteMode } from '../slices/remoteModeSlice';

export const initializeRemoteMode = () => {
  return async (dispatch: any) => {
    try {
      await dispatch(fetchRemoteMode());
    } catch (error) {
      console.error('[RemoteMode] Failed to initialize remote mode:', error);
    }
  };
};