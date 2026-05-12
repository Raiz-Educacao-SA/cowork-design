import { useCallback, useEffect, useState } from 'react';
import { LOCALES, type Locale } from '../../i18n';
import { normalizeAccentColor } from '../../state/appearance';
import type { AppConfig, AppTheme } from '../../types';

export const RAIZ_BRIDGE_MESSAGE_TYPE = 'raiz:cowork-design:session';
export const RAIZ_READY_MESSAGE_TYPE = 'raiz:cowork-design:ready';
export const RAIZ_SESSION_STORAGE_KEY = 'raiz:cowork-design:session';

type ManagedSetting = 'locale' | 'theme' | 'accentColor' | 'designSystemId';
export type RaizMediaCapability = 'text' | 'image' | 'video' | 'audio';

export interface RaizBridgeSession {
  token: string;
  expiresAt: string;
}

export interface RaizBridgeContext {
  session: RaizBridgeSession;
  sourceOrigin: string;
  raizPlatformOrigin: string;
  locale: Locale;
  theme?: AppTheme;
  accentColor?: string;
  workspaceId?: string;
  workspace?: {
    id: string;
    name?: string;
  };
  user?: {
    name?: string;
    email?: string;
    avatar?: string | null;
  };
  capabilities: {
    artifactsWrite: boolean;
    managedSettings: ManagedSetting[];
    media: RaizMediaCapability[];
    audioVideoEnabled: boolean;
    budgetScope?: 'organization' | 'workspace' | 'user';
    managedProvider?: boolean;
    keyRotationRole?: 'super-admin' | 'admin';
  };
  designSystem?: {
    id: string;
    name?: string;
    accentColor?: string;
  };
}

export interface RaizArtifactPublishInput {
  name: string;
  description?: string | null;
  content: string;
  contentType?: 'code' | 'markdown' | 'html' | 'svg' | 'mermaid' | 'csv';
  filename?: string;
  tags?: string[];
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface RaizArtifactPublishResult {
  ok: boolean;
  status: number;
  error?: string;
  data?: unknown;
}

interface UseRaizBridgeOptions {
  onContext?: (context: RaizBridgeContext) => void;
}

function readCsvEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedRaizOrigins(): Set<string> {
  const configured = [
    ...readCsvEnv(process.env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGIN),
    ...readCsvEnv(process.env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGINS),
  ];
  const developmentOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://127.0.0.1:3000'];

  return new Set([...developmentOrigins, ...configured]);
}

export function isAllowedRaizOrigin(origin: string): boolean {
  return allowedRaizOrigins().has(origin);
}

export function isRaizEmbeddedMode(search?: string): boolean {
  if (typeof window === 'undefined' && search == null) return false;
  const params = new URLSearchParams(search ?? window.location.search);
  return params.get('embed') === 'raiz';
}

function getRaizParentTargetOrigin(): string | null {
  if (typeof document !== 'undefined' && document.referrer) {
    try {
      const referrerOrigin = new URL(document.referrer).origin;
      if (isAllowedRaizOrigin(referrerOrigin)) return referrerOrigin;
    } catch {
      /* Ignore malformed referrers and skip ready postMessage. */
    }
  }

  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asLocale(value: unknown): Locale {
  const raw = asString(value);
  return raw && (LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : 'pt-BR';
}

function asTheme(value: unknown): AppTheme | undefined {
  return value === 'light' || value === 'dark' || value === 'system' ? value : undefined;
}

function asManagedSettings(value: unknown): ManagedSetting[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ManagedSetting =>
      item === 'locale' || item === 'theme' || item === 'accentColor' || item === 'designSystemId'
  );
}

function asMediaCapabilities(value: unknown): RaizMediaCapability[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is RaizMediaCapability =>
      item === 'text' || item === 'image' || item === 'video' || item === 'audio'
  );
}

function asBudgetScope(value: unknown): RaizBridgeContext['capabilities']['budgetScope'] {
  return value === 'organization' || value === 'workspace' || value === 'user'
    ? value
    : undefined;
}

function parseWorkspace(value: unknown): RaizBridgeContext['workspace'] {
  const raw = asObject(value);
  const id = asString(raw?.id);
  if (!id) return undefined;
  return {
    id,
    name: asString(raw?.name),
  };
}

function parseUser(value: unknown): RaizBridgeContext['user'] {
  const raw = asObject(value);
  if (!raw) return undefined;
  return {
    name: asString(raw.name),
    email: asString(raw.email),
    avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
  };
}

function parseDesignSystem(value: unknown): RaizBridgeContext['designSystem'] {
  const raw = asObject(value);
  const id = asString(raw?.id);
  if (!id) return undefined;
  return {
    id,
    name: asString(raw?.name),
    accentColor: normalizeAccentColor(raw?.accentColor) ?? undefined,
  };
}

export function parseRaizBridgeMessage(
  data: unknown,
  sourceOrigin: string
): RaizBridgeContext | null {
  const raw = asObject(data);
  if (!raw || raw.type !== RAIZ_BRIDGE_MESSAGE_TYPE || raw.version !== 1) return null;

  const token = asString(raw.token);
  const expiresAt = asString(raw.expiresAt);
  const raizPlatformOrigin = asString(raw.raizPlatformOrigin) ?? sourceOrigin;
  if (!token || !expiresAt) return null;

  const capabilities = asObject(raw.capabilities);
  const workspaceId = asString(raw.workspaceId);

  return {
    session: { token, expiresAt },
    sourceOrigin,
    raizPlatformOrigin,
    locale: asLocale(raw.locale),
    theme: asTheme(raw.theme),
    accentColor: normalizeAccentColor(raw.accentColor) ?? undefined,
    workspaceId,
    workspace: parseWorkspace(raw.workspace) ?? (workspaceId ? { id: workspaceId } : undefined),
    user: parseUser(raw.user),
    capabilities: {
      artifactsWrite: capabilities?.artifactsWrite === true,
      managedSettings: asManagedSettings(capabilities?.managedSettings),
      media: asMediaCapabilities(capabilities?.media),
      audioVideoEnabled: capabilities?.audioVideoEnabled === true,
      budgetScope: asBudgetScope(capabilities?.budgetScope),
      managedProvider: capabilities?.managedProvider === true,
      keyRotationRole:
        capabilities?.keyRotationRole === 'super-admin' || capabilities?.keyRotationRole === 'admin'
          ? capabilities.keyRotationRole
          : undefined,
    },
    designSystem: parseDesignSystem(raw.designSystem),
  };
}

export function persistRaizSession(context: RaizBridgeContext): void {
  try {
    window.sessionStorage.setItem(
      RAIZ_SESSION_STORAGE_KEY,
      JSON.stringify({
        token: context.session.token,
        expiresAt: context.session.expiresAt,
        workspaceId: context.workspaceId,
        raizPlatformOrigin: context.raizPlatformOrigin,
      })
    );
  } catch {
    /* sessionStorage can be disabled in hardened browser contexts */
  }
}

export function applyRaizContextToConfig(
  config: AppConfig,
  context: RaizBridgeContext | null
): AppConfig {
  if (!context) return config;

  const nextTheme = context.theme ?? config.theme;
  const nextAccentColor = context.accentColor ?? config.accentColor;

  if (nextTheme === config.theme && nextAccentColor === config.accentColor) {
    return config;
  }

  return {
    ...config,
    theme: nextTheme,
    accentColor: nextAccentColor,
  };
}

function artifactBridgeUrl(context: RaizBridgeContext): string {
  return `${context.raizPlatformOrigin.replace(/\/+$/, '')}/api/cowork-design/artifacts`;
}

export async function publishRaizArtifact(
  context: RaizBridgeContext | null,
  input: RaizArtifactPublishInput
): Promise<RaizArtifactPublishResult> {
  if (!context) {
    return { ok: false, status: 0, error: 'Raiz bridge context is unavailable' };
  }
  if (!context.capabilities.artifactsWrite || !context.workspaceId) {
    return { ok: false, status: 403, error: 'Artifact publishing is not allowed for this session' };
  }

  const response = await fetch(artifactBridgeUrl(context), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId: context.workspaceId,
      ...input,
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success !== true) {
    return {
      ok: false,
      status: response.status,
      error:
        body?.error?.message ?? body?.error ?? `Raiz artifact bridge failed (${response.status})`,
      data: body,
    };
  }

  return { ok: true, status: response.status, data: body.data };
}

export function useRaizBridge(options: UseRaizBridgeOptions = {}) {
  const { onContext } = options;
  const [embedded, setEmbedded] = useState(false);
  const [context, setContext] = useState<RaizBridgeContext | null>(null);

  useEffect(() => {
    const nextEmbedded = isRaizEmbeddedMode();
    setEmbedded(nextEmbedded);
    document.documentElement.classList.toggle('raiz-embedded', nextEmbedded);

    if (nextEmbedded && window.parent && window.parent !== window) {
      const parentOrigin = getRaizParentTargetOrigin();
      if (parentOrigin) {
        window.parent.postMessage({ type: RAIZ_READY_MESSAGE_TYPE, version: 1 }, parentOrigin);
      }
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isAllowedRaizOrigin(event.origin)) return;
      const parsed = parseRaizBridgeMessage(event.data, event.origin);
      if (!parsed) return;

      persistRaizSession(parsed);
      setContext(parsed);
      onContext?.(parsed);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onContext]);

  const publishArtifact = useCallback(
    (input: RaizArtifactPublishInput) => publishRaizArtifact(context, input),
    [context]
  );

  return {
    embedded,
    context,
    publishArtifact,
  };
}
