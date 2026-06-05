import { access } from 'node:fs/promises';

const JAVASCRIPT_SPECIFIER_PATTERN = /\.(?:[cm]?js)$/;
const TYPESCRIPT_FALLBACK_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

function isModuleNotFoundError(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND';
}

function isRelativeOrAbsoluteSpecifier(specifier) {
  return specifier.startsWith('./')
    || specifier.startsWith('../')
    || specifier.startsWith('/')
    || specifier.startsWith('file://');
}

function buildTypescriptFallbackSpecifiers(specifier) {
  return TYPESCRIPT_FALLBACK_EXTENSIONS.map((extension) => specifier.replace(JAVASCRIPT_SPECIFIER_PATTERN, extension));
}

async function canResolveSpecifier(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);

  if (resolved.url.startsWith('file://')) {
    await access(new URL(resolved.url));
  }

  return resolved;
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!isModuleNotFoundError(error) || !isRelativeOrAbsoluteSpecifier(specifier) || !JAVASCRIPT_SPECIFIER_PATTERN.test(specifier)) {
      throw error;
    }

    for (const candidateSpecifier of buildTypescriptFallbackSpecifiers(specifier)) {
      try {
        return await canResolveSpecifier(candidateSpecifier, context, nextResolve);
      } catch (candidateError) {
        if (!isModuleNotFoundError(candidateError)) {
          throw candidateError;
        }
      }
    }

    throw error;
  }
}
