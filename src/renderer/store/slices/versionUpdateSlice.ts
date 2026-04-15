import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface VersionAutoUpdateSettings {
  enabled: boolean;
  retainedArchiveCount: number;
}

export interface VersionUpdateVersion {
  id: string;
  version: string;
  packageFilename: string;
  platform: string;
  sourceType?: string;
}

export interface VersionUpdateCachedArchive {
  versionId: string;
  version: string;
  packageFilename: string;
  cachePath: string;
  retainedAt: string;
  verifiedAt: string;
  fileSize: number;
  sourceType?: string;
}

export interface VersionUpdateSnapshot {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'failed' | 'disabled';
  currentVersion: VersionUpdateVersion | null;
  latestVersion: VersionUpdateVersion | null;
  downloadedVersionId: string | null;
  lastCheckedAt: string | null;
  lastUpdatedAt: string | null;
  disabledReason: 'settings-disabled' | 'portable-mode' | 'no-package-source' | null;
  cachedArchives: VersionUpdateCachedArchive[];
  failure: { message: string; at: string } | null;
}

interface VersionUpdateState {
  snapshot: VersionUpdateSnapshot | null;
  settings: VersionAutoUpdateSettings;
  isLoadingSnapshot: boolean;
  isLoadingSettings: boolean;
  isSavingSettings: boolean;
  saveError: string | null;
}

declare global {
  interface Window {
    electronAPI: {
      versionGetUpdateSnapshot: () => Promise<VersionUpdateSnapshot>;
      versionGetAutoUpdateSettings: () => Promise<VersionAutoUpdateSettings>;
      versionSetAutoUpdateSettings: (settings: VersionAutoUpdateSettings) => Promise<VersionAutoUpdateSettings>;
      onVersionUpdateChanged: (callback: (snapshot: VersionUpdateSnapshot) => void) => (() => void) | void;
    };
  }
}

const initialState: VersionUpdateState = {
  snapshot: null,
  settings: {
    enabled: true,
    retainedArchiveCount: 5,
  },
  isLoadingSnapshot: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  saveError: null,
};

export const fetchVersionUpdateSnapshot = createAsyncThunk(
  'versionUpdate/fetchSnapshot',
  async (_, { rejectWithValue }) => {
    try {
      return await window.electronAPI.versionGetUpdateSnapshot();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const fetchVersionAutoUpdateSettings = createAsyncThunk(
  'versionUpdate/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      return await window.electronAPI.versionGetAutoUpdateSettings();
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

export const saveVersionAutoUpdateSettings = createAsyncThunk(
  'versionUpdate/saveSettings',
  async (settings: VersionAutoUpdateSettings, { rejectWithValue }) => {
    const retainedArchiveCount = Number.parseInt(String(settings.retainedArchiveCount), 10);
    if (!Number.isInteger(retainedArchiveCount) || retainedArchiveCount <= 0) {
      return rejectWithValue('retained-archive-count-must-be-positive');
    }

    try {
      return await window.electronAPI.versionSetAutoUpdateSettings({
        enabled: settings.enabled,
        retainedArchiveCount,
      });
    } catch (error) {
      return rejectWithValue(error instanceof Error ? error.message : String(error));
    }
  },
);

const versionUpdateSlice = createSlice({
  name: 'versionUpdate',
  initialState,
  reducers: {
    setVersionUpdateSnapshotFromEvent(state, action: PayloadAction<VersionUpdateSnapshot>) {
      state.snapshot = action.payload;
    },
    clearVersionUpdateSaveError(state) {
      state.saveError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVersionUpdateSnapshot.pending, (state) => {
        state.isLoadingSnapshot = true;
      })
      .addCase(fetchVersionUpdateSnapshot.fulfilled, (state, action) => {
        state.isLoadingSnapshot = false;
        state.snapshot = action.payload;
      })
      .addCase(fetchVersionUpdateSnapshot.rejected, (state) => {
        state.isLoadingSnapshot = false;
      })
      .addCase(fetchVersionAutoUpdateSettings.pending, (state) => {
        state.isLoadingSettings = true;
      })
      .addCase(fetchVersionAutoUpdateSettings.fulfilled, (state, action) => {
        state.isLoadingSettings = false;
        state.settings = action.payload;
      })
      .addCase(fetchVersionAutoUpdateSettings.rejected, (state) => {
        state.isLoadingSettings = false;
      })
      .addCase(saveVersionAutoUpdateSettings.pending, (state) => {
        state.isSavingSettings = true;
        state.saveError = null;
      })
      .addCase(saveVersionAutoUpdateSettings.fulfilled, (state, action) => {
        state.isSavingSettings = false;
        state.settings = action.payload;
      })
      .addCase(saveVersionAutoUpdateSettings.rejected, (state, action) => {
        state.isSavingSettings = false;
        state.saveError = typeof action.payload === 'string' ? action.payload : 'save-failed';
      });
  },
});

export const {
  setVersionUpdateSnapshotFromEvent,
  clearVersionUpdateSaveError,
} = versionUpdateSlice.actions;

export const selectVersionUpdateSnapshot = (state: { versionUpdate: VersionUpdateState }) => state.versionUpdate.snapshot;
export const selectVersionAutoUpdateSettings = (state: { versionUpdate: VersionUpdateState }) => state.versionUpdate.settings;
export const selectVersionUpdateSettingsLoading = (state: { versionUpdate: VersionUpdateState }) => state.versionUpdate.isLoadingSettings;
export const selectVersionUpdateSaving = (state: { versionUpdate: VersionUpdateState }) => state.versionUpdate.isSavingSettings;
export const selectVersionUpdateSaveError = (state: { versionUpdate: VersionUpdateState }) => state.versionUpdate.saveError;

// Keep this selector snapshot-focused; homepage portable-mode suppression happens in SystemManagementView.
export const selectVisibleVersionUpdateReminder = (state: { versionUpdate: VersionUpdateState }) => {
  const snapshot = state.versionUpdate.snapshot;
  if (!snapshot) {
    return null;
  }

  if (snapshot.status === 'idle') {
    return null;
  }

  if (!snapshot.currentVersion && !snapshot.latestVersion) {
    return null;
  }

  return snapshot;
};

export default versionUpdateSlice.reducer;
