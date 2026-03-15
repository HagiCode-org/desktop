import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/webServiceSlice.ts');
const thunkPath = path.resolve(process.cwd(), 'src/renderer/store/thunks/webServiceThunks.ts');
const cardPath = path.resolve(process.cwd(), 'src/renderer/components/WebServiceStatusCard.tsx');

describe('renderer listen-host integration', () => {
  it('stores bind host state in the Redux slice and updates it from process info', async () => {
    const source = await fs.readFile(slicePath, 'utf-8');

    assert.match(source, /host: string;/);
    assert.match(source, /setHost: \(state, action: PayloadAction<string>\) =>/);
    assert.match(source, /state\.host = action\.payload;/);
    assert.match(source, /state\.host = action\.payload\.host;/);
  });

  it('routes host updates through the config thunk and mirrors success into Redux state', async () => {
    const source = await fs.readFile(thunkPath, 'utf-8');

    assert.match(source, /setWebServiceConfig\(config\)/);
    assert.match(source, /dispatch\(setHost\(config\.host\)\)/);
    assert.match(source, /dispatch\(setPort\(config\.port\)\)/);
    assert.match(source, /host: DEFAULT_WEB_SERVICE_HOST/);
  });

  it('shows preset listen-address choices, validates custom IPv4 input, auto-saves with debounce, and hides local controls in remote mode', async () => {
    const source = await fs.readFile(cardPath, 'utf-8');

    assert.match(source, /value: 'localhost'/);
    assert.match(source, /value: '127\.0\.0\.1'/);
    assert.match(source, /value: '0\.0\.0\.0'/);
    assert.match(source, /value: 'custom'/);
    assert.match(source, /selectedListenPreset === 'custom'/);
    assert.match(source, /!isValidIpv4Address\(customListenHost\)/);
    assert.match(source, /setTimeout\(\(\) => \{/);
    assert.match(source, /}, 1000\)/);
    assert.match(source, /await flushPendingNetworkConfig\(\)/);
    assert.match(source, /remoteModeEnabled \? \(/);
  });
});
