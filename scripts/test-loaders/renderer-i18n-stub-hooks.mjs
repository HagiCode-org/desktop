const STUB_MODULES = {
  '@/i18n': 'export default {};',
  '@/i18n/config': 'export const availableLanguages = [];',
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(STUB_MODULES, specifier)) {
    return { url: `data:text/javascript,${encodeURIComponent(STUB_MODULES[specifier])}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
