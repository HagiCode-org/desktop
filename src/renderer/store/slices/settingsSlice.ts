import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import i18n from '@/i18n';
import type {
  HagihubApi,
  NotificationClickedPayload,
  NotificationParams,
  NotificationResult,
  NotificationShownPayload,
} from '../../../shared/api.js';

declare global {
  interface Window {
    hagihub: HagihubApi;
  }
}

export interface SettingsState {
  notificationSendStatus: 'idle' | 'sending' | 'success' | 'error';
  lastNotificationError: string | null;
  lastNotificationResult: NotificationResult | null;
  lastShownPayload: NotificationShownPayload | null;
  lastClickedPayload: NotificationClickedPayload | null;
}

const initialState: SettingsState = {
  notificationSendStatus: 'idle',
  lastNotificationError: null,
  lastNotificationResult: null,
  lastShownPayload: null,
  lastClickedPayload: null,
};

export function buildTestNotificationParams(): NotificationParams {
  return {
    title: i18n.t('pages:settings.notification.testTitle'),
    body: i18n.t('pages:settings.notification.testBody'),
    level: 'info',
    clickAction: { type: 'focus-window' },
    duration: 0,
    silent: false,
  };
}

export const sendTestNotification = createAsyncThunk(
  'settings/sendTestNotification',
  async (params: NotificationParams, { rejectWithValue }) => {
    try {
      const result = await window.hagihub.sendNotification(params);
      if (!result.success) {
        return rejectWithValue(result.error ?? 'notification-send-failed');
      }
      return result;
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setNotificationShown(state, action: PayloadAction<NotificationShownPayload>) {
      state.lastShownPayload = action.payload;
    },
    setNotificationClicked(state, action: PayloadAction<NotificationClickedPayload>) {
      state.lastClickedPayload = action.payload;
    },
    clearNotificationFeedback(state) {
      state.notificationSendStatus = 'idle';
      state.lastNotificationError = null;
      state.lastNotificationResult = null;
      state.lastShownPayload = null;
      state.lastClickedPayload = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendTestNotification.pending, (state) => {
        state.notificationSendStatus = 'sending';
        state.lastNotificationError = null;
      })
      .addCase(sendTestNotification.fulfilled, (state, action) => {
        state.notificationSendStatus = 'success';
        state.lastNotificationResult = action.payload;
      })
      .addCase(sendTestNotification.rejected, (state, action) => {
        state.notificationSendStatus = 'error';
        state.lastNotificationError = typeof action.payload === 'string' ? action.payload : 'notification-send-failed';
      });
  },
});

export const {
  clearNotificationFeedback,
  setNotificationClicked,
  setNotificationShown,
} = settingsSlice.actions;

export const selectNotificationSendStatus = (state: { settings: SettingsState }) => state.settings.notificationSendStatus;
export const selectNotificationSendError = (state: { settings: SettingsState }) => state.settings.lastNotificationError;
export const selectNotificationResult = (state: { settings: SettingsState }) => state.settings.lastNotificationResult;
export const selectNotificationShownPayload = (state: { settings: SettingsState }) => state.settings.lastShownPayload;
export const selectNotificationClickedPayload = (state: { settings: SettingsState }) => state.settings.lastClickedPayload;
export const selectNotificationPreview = (_state: { settings: SettingsState }) => buildTestNotificationParams();

export default settingsSlice.reducer;
