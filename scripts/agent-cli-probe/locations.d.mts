export function normalizeLexicalPath(value: string, platform: NodeJS.Platform): string;
export function expandExpectedLocation(
  entry: string,
  context: { platform: NodeJS.Platform; env?: Record<string, string | undefined>; npmGlobalBin?: string | null; brewBin?: string | null },
): string | null;
export function expectedDirectories(
  row: { expectedLocation: Partial<Record<string, string[]>> },
  osName: string,
  context: { platform: NodeJS.Platform; env?: Record<string, string | undefined>; npmGlobalBin?: string | null; brewBin?: string | null },
): string[];
export function isInsideExpectedLocation(resolvedPath: string | null, directories: string[], platform: NodeJS.Platform): boolean;
export function extractSemver(output: string | null | undefined): string | null;
export function executableNamesFor(binName: string, platform: NodeJS.Platform): string[];
