import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron';

function pushMenuGroup(
  target: MenuItemConstructorOptions[],
  group: MenuItemConstructorOptions[],
): void {
  if (group.length === 0) {
    return;
  }

  if (target.length > 0) {
    target.push({ type: 'separator' });
  }

  target.push(...group);
}

export function buildClipboardContextMenuTemplate(
  params: Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>,
  hasClipboardText: boolean,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  const selectionText = params.selectionText?.length ? params.selectionText : '';

  if (!params.isEditable) {
    if (selectionText.length > 0) {
      template.push({ role: 'copy' });
    }
    return template;
  }

  const historyActions: MenuItemConstructorOptions[] = [];
  if (params.editFlags.canUndo) {
    historyActions.push({ role: 'undo' });
  }
  if (params.editFlags.canRedo) {
    historyActions.push({ role: 'redo' });
  }

  const editActions: MenuItemConstructorOptions[] = [];
  if (params.editFlags.canCut) {
    editActions.push({ role: 'cut' });
  }
  if (params.editFlags.canCopy) {
    editActions.push({ role: 'copy' });
  }
  if (params.editFlags.canPaste && hasClipboardText) {
    editActions.push({ role: 'paste' });
  }

  const selectionActions: MenuItemConstructorOptions[] = [];
  if (params.editFlags.canSelectAll) {
    selectionActions.push({ role: 'selectAll' });
  }

  pushMenuGroup(template, historyActions);
  pushMenuGroup(template, editActions);
  pushMenuGroup(template, selectionActions);

  return template;
}
