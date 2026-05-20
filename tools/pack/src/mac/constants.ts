export const PRODUCT_NAME = "Open Design";

export const INTERNAL_PACKAGES = [
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

export const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";
export const WEB_STANDALONE_HOOK_CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
export const WEB_STANDALONE_RESOURCE_NAME = "open-design-web-standalone";
// Fase 3.5 (item A): asar=true compresses all JS/assets into a single archive,
// reducing uncompressed size significantly. Only native addons (.node) are
// unpacked because they must be loaded by Node's native binding loader.
export const ELECTRON_BUILDER_ASAR = true;
export const ELECTRON_BUILDER_ASAR_UNPACK = "**/*.node";
export const ELECTRON_BUILDER_FILE_PATTERNS = [
  "**/*",
  "!**/node_modules/.bin",
  "!**/node_modules/electron{,/**/*}",
  "!**/*.map",
  "!**/*.tsbuildinfo",
  "!**/.next/cache",
  "!**/.next/cache/**",
  "!**/node_modules/better-sqlite3/build/Release/obj",
  "!**/node_modules/better-sqlite3/build/Release/obj/**",
  "!**/node_modules/better-sqlite3/deps",
  "!**/node_modules/better-sqlite3/deps/**",
  // Fase 3.5: exclude doc/test assets from transitive node_modules
  "!**/node_modules/**/README{,.md,.txt}",
  "!**/node_modules/**/CHANGELOG{,.md,.txt}",
  "!**/node_modules/**/LICENSE{,.md,.txt}",
  "!**/node_modules/**/*.d.ts",
  "!**/node_modules/**/__tests__{,/**}",
  "!**/node_modules/**/test{,/**}",
  "!**/node_modules/**/tests{,/**}",
] as const;
// Keep Electron native UI resources aligned with the Web UI locale set.
// Electron uses underscore-separated locale ids; its base "es" resource
// covers the app's es-ES dictionary.
export const MAC_ELECTRON_LANGUAGES = [
  "en",
  "de",
  "zh_CN",
  "zh_TW",
  "pt_BR",
  "es",
  "ru",
  "fa",
  "ar",
  "ja",
  "ko",
  "pl",
  "hu",
  "fr",
  "uk",
  "tr",
] as const;
