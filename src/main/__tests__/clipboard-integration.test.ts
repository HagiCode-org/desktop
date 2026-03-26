import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildClipboardContextMenuTemplate } from '../clipboard-context-menu.js';
import { buildMenuTemplate } from '../menu-template.js';

describe('desktop clipboard integration', () => {
  it('registers a standard edit menu before the Hagicode web menu', () => {
    const template = buildMenuTemplate({
      translations: {
        edit: 'Edit',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navigate',
        back: 'Back',
        forward: 'Forward',
        refresh: 'Refresh',
        devTools: 'Developer Tools',
        help: 'Help',
        about: 'About',
        quit: 'Quit',
      },
      isMac: false,
      appName: 'Hagicode Desktop',
      webServiceRunning: true,
      onNavigateWebView: () => {},
      onOpenDevTools: () => {},
    });

    assert.equal(template[0]?.label, 'Edit');

    const editRoles = Array.isArray(template[0]?.submenu)
      ? template[0].submenu
          .filter((item) => 'role' in item)
          .map((item) => item.role)
      : [];

    assert.deepEqual(editRoles, ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
    assert.equal((template[1] as { label?: string }).label, 'Hagicode Web');
  });

  it('keeps existing navigation accelerators intact', () => {
    const template = buildMenuTemplate({
      translations: {
        edit: 'Edit',
        hagicoWeb: 'Hagicode Web',
        navigate: 'Navigate',
        back: 'Back',
        forward: 'Forward',
        refresh: 'Refresh',
        devTools: 'Developer Tools',
        help: 'Help',
        about: 'About',
        quit: 'Quit',
      },
      isMac: true,
      appName: 'Hagicode Desktop',
      webServiceRunning: true,
      onNavigateWebView: () => {},
      onOpenDevTools: () => {},
    });

    const hagicodeMenu = template[2];
    assert.equal(hagicodeMenu?.label, 'Hagicode Web');

    const navigationMenu = Array.isArray(hagicodeMenu?.submenu) ? hagicodeMenu.submenu[0] : undefined;
    const navigationEntries = Array.isArray(navigationMenu?.submenu) ? navigationMenu.submenu : [];

    assert.deepEqual(
      navigationEntries.map((item) => ('accelerator' in item ? item.accelerator : undefined)),
      ['CmdOrCtrl+Left', 'CmdOrCtrl+Right', 'CmdOrCtrl+R'],
    );
  });

  it('offers copy-only context menus for selected read-only text', () => {
    const template = buildClipboardContextMenuTemplate(
      {
        isEditable: false,
        selectionText: 'selected text',
        editFlags: {
          canUndo: false,
          canRedo: false,
          canCut: false,
          canCopy: true,
          canPaste: false,
          canDelete: false,
          canSelectAll: false,
          canEditRichly: false,
        },
      },
      true,
    );

    assert.deepEqual(template.map((item) => item.role), ['copy']);
  });

  it('shows only currently valid edit actions for editable fields', () => {
    const template = buildClipboardContextMenuTemplate(
      {
        isEditable: true,
        selectionText: 'editable text',
        editFlags: {
          canUndo: true,
          canRedo: false,
          canCut: true,
          canCopy: true,
          canPaste: true,
          canDelete: false,
          canSelectAll: true,
          canEditRichly: false,
        },
      },
      true,
    );

    assert.deepEqual(
      template
        .filter((item) => item.type !== 'separator')
        .map((item) => item.role),
      ['undo', 'cut', 'copy', 'paste', 'selectAll'],
    );
  });
});
