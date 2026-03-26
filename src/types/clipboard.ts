export const clipboardChannels = {
  readText: 'clipboard:read-text',
  writeText: 'clipboard:write-text',
} as const;

export type ClipboardChannelMap = typeof clipboardChannels;
