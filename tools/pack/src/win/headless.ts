import { execFile } from "node:child_process";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import { spawnBackgroundProcess } from "@open-design/platform";

import type { ToolPackConfig } from "../config.js";
import { WEB_STANDALONE_RESOURCE_NAME } from "./constants.js";
import { pathExists } from "./fs.js";
import { resolveWinPaths, sanitizeNamespace } from "./paths.js";
import type { WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

// --- Path helpers ----------------------------------------------------------
//
// The Windows headless reuses artifacts already produced by `tools-pack win build`:
//   - The Electron exe (renamed to product name) under `<unpacked>/<Product>.exe`.
//     We launch it with ELECTRON_RUN_AS_NODE=1 so it executes headless.mjs as a Node
//     process, matching the Electron ABI used to compile native modules (better-sqlite3).
//   - The packaged `headless.mjs` entry under `<unpacked>/resources/app/node_modules/`.
//   - The Open Design resource root under `<unpacked>/resources/open-design/`.
//   - The Next.js standalone bundle under `<unpacked>/resources/<WEB_STANDALONE_RESOURCE_NAME>/`.
//
// Linux headless ships a standalone `bin/node` and a "server-mode" web layout;
// Windows builds ship the Electron runtime + Next.js standalone, so we opt the
// headless web sidecar into standalone mode via OD_WEB_OUTPUT_MODE/OD_WEB_STANDALONE_ROOT
// (supported by `apps/packaged/src/headless.ts`).

function resolveWinHeadlessEntryPath(paths: WinPaths): string {
  return join(
    paths.unpackedRoot,
    "resources",
    "app",
    "node_modules",
    "@open-design",
    "packaged",
    "dist",
    "headless.mjs",
  );
}

function resolveWinHeadlessElectronPath(paths: WinPaths): string {
  return paths.unpackedExePath;
}

function resolveWinHeadlessResourceRoot(paths: WinPaths): string {
  return join(paths.unpackedRoot, "resources", "open-design");
}

function resolveWinHeadlessWebStandaloneRoot(paths: WinPaths): string {
  return join(paths.unpackedRoot, "resources", WEB_STANDALONE_RESOURCE_NAME);
}

function headlessLauncherPath(config: ToolPackConfig): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  return join(base, "open-design", `headless-${sanitizeNamespace(config.namespace)}.cmd`);
}

function headlessLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

function desktopIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
}

function webIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "web-root.json");
}

function winHeadlessStamp(config: ToolPackConfig): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: config.namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace: config.namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

async function waitForMarker(markerPath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pathExists(markerPath)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

type WebRootIdentity = {
  namespace: string;
  pid: number;
  url: string;
  startedAt: string;
  version: 1;
};

function isValidWebIdentity(
  identity: unknown,
  namespace: string,
  pid: number,
): identity is WebRootIdentity {
  if (typeof identity !== "object" || identity == null) return false;
  const obj = identity as Record<string, unknown>;
  return (
    obj.version === 1 &&
    obj.namespace === namespace &&
    obj.pid === pid &&
    typeof obj.url === "string" &&
    obj.url.length > 0
  );
}

async function waitForWebIdentity(
  config: ToolPackConfig,
  childPid: number,
  timeoutMs: number,
): Promise<WebRootIdentity | null> {
  const path = webIdentityPath(config);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(path, "utf8");
      const identity: unknown = JSON.parse(content);
      if (isValidWebIdentity(identity, config.namespace, childPid)) return identity;
    } catch {
      // marker not yet readable
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

// --- Public API ------------------------------------------------------------

export type WinHeadlessInstallResult = {
  launcherPath: string;
  namespace: string;
};

export type WinHeadlessStartResult = {
  launcherPath: string;
  logPath: string;
  namespace: string;
  pid: number;
  status: WebRootIdentity;
};

export type WinHeadlessStopResult = {
  namespace: string;
  status: "stopped" | "not-running";
  stoppedPids: number[];
};

export async function installPackedWinHeadless(config: ToolPackConfig): Promise<WinHeadlessInstallResult> {
  const paths = resolveWinPaths(config);
  const entryPath = resolveWinHeadlessEntryPath(paths);
  const electronPath = resolveWinHeadlessElectronPath(paths);
  const resourceRoot = resolveWinHeadlessResourceRoot(paths);
  const webStandaloneRoot = resolveWinHeadlessWebStandaloneRoot(paths);

  if (!(await pathExists(entryPath))) {
    throw new Error(`headless entry not found at ${entryPath}; run \`tools-pack win build --to dir\` first`);
  }
  if (!(await pathExists(electronPath))) {
    throw new Error(`electron exe not found at ${electronPath}; run \`tools-pack win build\` first`);
  }

  const launcherPath = headlessLauncherPath(config);
  await mkdir(dirname(launcherPath), { recursive: true });

  // Self-contained .cmd launcher. ELECTRON_RUN_AS_NODE makes the packaged electron
  // run headless.mjs as Node, matching the Electron ABI of bundled native modules
  // (better-sqlite3). OD_WEB_OUTPUT_MODE=standalone points the web sidecar at the
  // standalone bundle shipped under resources/<WEB_STANDALONE_RESOURCE_NAME>.
  const dataDir = dirname(config.roots.runtime.namespaceBaseRoot);
  const namespaceEnv = config.namespace.replace(/"/g, '""');
  const script =
    [
      "@echo off",
      `REM Open Design headless launcher - namespace: ${config.namespace}`,
      `set "OD_NAMESPACE=${namespaceEnv}"`,
      `set "OD_DATA_DIR=${dataDir}"`,
      `set "OD_RESOURCE_ROOT=${resourceRoot}"`,
      `set "OD_WEB_OUTPUT_MODE=standalone"`,
      `set "OD_WEB_STANDALONE_ROOT=${webStandaloneRoot}"`,
      `set "ELECTRON_RUN_AS_NODE=1"`,
      `"${electronPath}" "${entryPath}" %*`,
    ].join("\r\n") + "\r\n";

  await writeFile(launcherPath, script, { encoding: "utf8" });

  // Reference the stamp so the typechecker (and future linters) keep this
  // file honest about the sidecar identity the headless will publish.
  void winHeadlessStamp(config);

  return { launcherPath, namespace: config.namespace };
}

export async function startPackedWinHeadless(config: ToolPackConfig): Promise<WinHeadlessStartResult> {
  const paths = resolveWinPaths(config);
  const entryPath = resolveWinHeadlessEntryPath(paths);
  const electronPath = resolveWinHeadlessElectronPath(paths);
  const resourceRoot = resolveWinHeadlessResourceRoot(paths);
  const webStandaloneRoot = resolveWinHeadlessWebStandaloneRoot(paths);

  if (!(await pathExists(entryPath))) {
    throw new Error(`headless entry not found at ${entryPath}; run \`tools-pack win build --to dir\` first`);
  }
  if (!(await pathExists(electronPath))) {
    throw new Error(`electron exe not found at ${electronPath}; run \`tools-pack win build\` first`);
  }

  const logPath = headlessLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  // Remove stale identity markers so waitForMarker / waitForWebIdentity below
  // wait for the freshly spawned process, not a previous one that crashed.
  await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  await rm(webIdentityPath(config), { force: true }).catch(() => undefined);

  const dataDir = dirname(config.roots.runtime.namespaceBaseRoot);

  const logHandle = await open(logPath, "a");
  let child: { pid: number };
  try {
    child = await spawnBackgroundProcess({
      args: [entryPath],
      command: electronPath,
      cwd: dirname(entryPath),
      env: {
        ...process.env,
        OD_NAMESPACE: config.namespace,
        OD_DATA_DIR: dataDir,
        OD_RESOURCE_ROOT: resourceRoot,
        OD_WEB_OUTPUT_MODE: "standalone",
        OD_WEB_STANDALONE_ROOT: webStandaloneRoot,
        ELECTRON_RUN_AS_NODE: "1",
      },
      logFd: logHandle.fd,
    });
  } finally {
    await logHandle.close().catch(() => undefined);
  }

  // 60s ceiling for desktop marker, 120s for the web URL (the standalone web
  // sidecar takes the longest to come up on cold Windows runners).
  const markerPath = desktopIdentityPath(config);
  const ready = await waitForMarker(markerPath, 60_000);
  if (!ready) {
    throw new Error(`headless desktop-root.json not written within 60s at ${markerPath}`);
  }

  const webIdentity = await waitForWebIdentity(config, child.pid, 120_000);
  if (webIdentity == null) {
    throw new Error(`web-root.json not written within 120s at ${webIdentityPath(config)}`);
  }

  return {
    launcherPath: headlessLauncherPath(config),
    logPath,
    namespace: config.namespace,
    pid: child.pid,
    status: webIdentity,
  };
}

export async function stopPackedWinHeadless(config: ToolPackConfig): Promise<WinHeadlessStopResult> {
  let markerPid: number | null = null;
  try {
    const content = await readFile(desktopIdentityPath(config), "utf8");
    const parsed = JSON.parse(content) as { pid?: unknown };
    if (typeof parsed.pid === "number") markerPid = parsed.pid;
  } catch {
    // no marker present; treat as not-running below
  }

  if (markerPid == null) {
    return { namespace: config.namespace, status: "not-running", stoppedPids: [] };
  }

  // Best-effort graceful shutdown via IPC; the headless's JSON IPC server
  // honors SIDECAR_MESSAGES.SHUTDOWN and tears its sidecars down cleanly.
  try {
    const ipc = resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: config.namespace,
    });
    await requestJsonIpc(ipc, { type: SIDECAR_MESSAGES.SHUTDOWN });
  } catch {
    // IPC may already be closed; fall through to force-kill the tree.
  }

  // Force-kill the electron parent and its sidecar children. On Windows the
  // sidecars are not detached into their own group; taskkill /T walks the tree.
  try {
    await execFileAsync("taskkill.exe", ["/PID", String(markerPid), "/T", "/F"], {
      timeout: 10_000,
    });
  } catch {
    // process may have already exited; not fatal
  }

  await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  await rm(webIdentityPath(config), { force: true }).catch(() => undefined);

  return { namespace: config.namespace, status: "stopped", stoppedPids: [markerPid] };
}
