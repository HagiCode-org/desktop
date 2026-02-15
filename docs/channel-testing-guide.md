# Channels Feature Testing Guide

This document describes how to manually test the channels support feature.

## Test Environment Setup

1. Start the Desktop client in development mode:
   ```bash
   npm run dev
   ```

2. Open Developer Tools (Ctrl+Shift+I or Cmd+Option+I)

3. Go to the Network tab to monitor HTTP requests

## Test Scenarios

### Scenario 1: Complete Channels Object

**Expected Result**: Versions correctly mapped to their channels (beta, stable, etc.)

**Steps**:
1. Open Network tab in DevTools
2. Navigate to the version management page
3. Look for the request to `server.dl.hagicode.com/index.json`
4. Verify the response contains a `channels` object with structure:
   ```json
   {
     "channels": {
       "beta": {
         "latest": "0.1.0-beta.11",
         "versions": ["0.1.0-beta.11", "0.1.0-beta.10"]
       },
       "stable": {
         "latest": "1.0.0",
         "versions": ["1.0.0"]
       }
     }
   }
   ```
5. In Console tab, run:
   ```javascript
   // Check if versions have channel property
   const versions = await window.electron.ipcRenderer.invoke('version:list');
   versions.forEach(v => console.log(`${v.version}: ${v.channel || 'undefined'}`));
   ```
6. Verify output shows correct channel mapping

### Scenario 2: No Channels Object (Backward Compatibility)

**Expected Result**: All versions default to 'beta' channel

**Steps**:
1. Modify the package source to point to a test index without channels
2. In Console tab, run:
   ```javascript
   const versions = await window.electron.ipcRenderer.invoke('version:list');
   versions.forEach(v => {
     console.assert(v.channel === 'beta', `${v.version} should be beta, got ${v.channel}`);
   });
   ```
3. Verify all versions have channel = 'beta'

### Scenario 3: Version Installation

**Expected Result**: Installing different channel versions works correctly

**Steps**:
1. Select a version from the 'beta' channel
2. Click Install
3. Verify installation succeeds
4. Repeat for 'stable' channel version
5. Verify both installations complete successfully

### Scenario 4: Version Switching

**Expected Result**: Switching between versions from different channels works

**Steps**:
1. Install two versions from different channels (e.g., beta and stable)
2. Switch active version between them
3. Verify switch operation completes
4. Verify correct version becomes active

## Success Criteria

- ✅ Desktop client successfully fetches version list with channels
- ✅ Each version displays correct channel information
- ✅ Versions without channel specification default to 'beta'
- ✅ No errors in console related to channels parsing
- ✅ Version installation and switching functionality works as expected

## Troubleshooting

### Issue: Versions show undefined channel

**Possible Causes**:
1. Server not returning `channels` object
2. Version strings in `channels.versions` don't match `versions.version`
3. Network error preventing full index download

**Debug Steps**:
1. Check Network tab for the index.json response
2. Verify `channels` object structure matches expected format
3. Check Console for parsing errors

### Issue: TypeError: Cannot read property 'versions' of undefined

**Solution**: This error is caught and logged. Check if the server returned an invalid channels structure.

## Test Data Reference

Example index.json with channels:
```json
{
  "updatedAt": "2026-02-15T05:45:05.2931068Z",
  "versions": [
    {
      "version": "0.1.0-beta.11",
      "files": ["hagicode-0.1.0-beta.11-linux-x64-nort.zip"],
      "assets": [
        {
          "name": "hagicode-0.1.0-beta.11-linux-x64-nort.zip",
          "path": "packages/hagicode-0.1.0-beta.11-linux-x64-nort.zip",
          "size": 123456789
        }
      ]
    }
  ],
  "channels": {
    "beta": {
      "latest": "0.1.0-beta.11",
      "versions": ["0.1.0-beta.11", "0.1.0-beta.10"]
    }
  }
}
```

## Automated Testing

To run automated tests (after Jest configuration):
```bash
npm test
```

Test file: `src/main/package-sources/http-index-source.test.ts`
