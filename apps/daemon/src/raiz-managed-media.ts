import { Buffer } from 'node:buffer';

type RaizMediaSurface = 'text' | 'image' | 'video' | 'audio';

interface RaizMediaGateway {
  mode?: 'daemon-forward' | 'direct';
  generateEndpoint?: string;
  defaultImageModel?: string;
  allowedImageModels?: string[];
  allowedSurfaces?: RaizMediaSurface[];
  providerLabel?: string;
}

interface RaizManagedSessionInput {
  token?: unknown;
  expiresAt?: unknown;
  workspaceId?: unknown;
  raizPlatformOrigin?: unknown;
  mediaGateway?: unknown;
}

export interface RaizManagedSession {
  token: string;
  expiresAt: string;
  workspaceId?: string;
  raizPlatformOrigin?: string;
  mediaGateway?: RaizMediaGateway;
}

interface ProjectFileMeta {
  name: string;
  path?: string;
  size: number;
  mtime: number;
  kind?: string;
  mime?: string;
}

interface GenerateRaizManagedImageArgs {
  session: RaizManagedSession | null;
  raizDaemonUrl?: string;
  projectsRoot: string;
  projectId: string;
  prompt?: string;
  output?: string;
  aspect?: string;
  model?: string;
  writeProjectFile: (
    projectsRoot: string,
    projectId: string,
    name: string,
    body: Buffer,
  ) => Promise<ProjectFileMeta>;
  fetchImpl?: typeof fetch;
  onProgress?: (line: string) => void;
}

let currentSession: RaizManagedSession | null = null;

const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
const DEFAULT_RAIZ_DAEMON_URL = 'http://127.0.0.1:9876';
const DEFAULT_FORWARD_ENDPOINT = '/api/cowork-design/media/generate';
const ADMIN_MESSAGE =
  'Geracao de imagem indisponivel. A configuracao central precisa ser revisada por um administrador.';
const SESSION_MESSAGE =
  'Sessao gerenciada do Raiz indisponivel. Atualize a pagina do Cowork Design e tente novamente.';

const SENSITIVE_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
];

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseMediaGateway(value: unknown): RaizMediaGateway | undefined {
  const raw = asObject(value);
  if (!raw) return undefined;
  const allowedImageModels = Array.isArray(raw.allowedImageModels)
    ? raw.allowedImageModels.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : undefined;
  const allowedSurfaces = Array.isArray(raw.allowedSurfaces)
    ? raw.allowedSurfaces.filter((item): item is RaizMediaSurface =>
        item === 'text' || item === 'image' || item === 'video' || item === 'audio',
      )
    : undefined;

  const gateway: RaizMediaGateway = {};
  if (raw.mode === 'daemon-forward' || raw.mode === 'direct') gateway.mode = raw.mode;
  const generateEndpoint = asString(raw.generateEndpoint);
  if (generateEndpoint) gateway.generateEndpoint = generateEndpoint;
  const defaultImageModel = asString(raw.defaultImageModel);
  if (defaultImageModel) gateway.defaultImageModel = defaultImageModel;
  if (allowedImageModels) gateway.allowedImageModels = allowedImageModels;
  if (allowedSurfaces) gateway.allowedSurfaces = allowedSurfaces;
  const providerLabel = asString(raw.providerLabel);
  if (providerLabel) gateway.providerLabel = providerLabel;
  return gateway;
}

function isExpired(expiresAt: string): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function sanitizeError(message: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[REDACTED]'),
    message,
  );
}

function extractErrorMessage(body: unknown): string {
  const raw = asObject(body);
  const error = raw?.error;
  if (typeof error === 'string') return error;
  const errorObject = asObject(error);
  if (typeof errorObject?.message === 'string') return errorObject.message;
  if (typeof raw?.message === 'string') return raw.message;
  return ADMIN_MESSAGE;
}

function imageSizeFromAspect(aspect?: string): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspect === '9:16' || aspect === '3:4') return '1024x1536';
  if (aspect === '16:9' || aspect === '4:3') return '1536x1024';
  return '1024x1024';
}

function outputName(output?: string): string {
  const raw = asString(output);
  if (!raw) return `raiz-image-${Date.now()}.png`;
  return /\.[a-z0-9]+$/i.test(raw) ? raw : `${raw}.png`;
}

function resolveForwardUrl(session: RaizManagedSession, raizDaemonUrl?: string): string {
  const baseUrl = raizDaemonUrl || process.env.RAIZ_DAEMON_URL || DEFAULT_RAIZ_DAEMON_URL;
  const endpoint = session.mediaGateway?.generateEndpoint || DEFAULT_FORWARD_ENDPOINT;
  return new URL(endpoint, baseUrl.replace(/\/+$/, '/') ).toString();
}

async function fetchImageUrl(fetchImpl: typeof fetch, imageUrl: string): Promise<Buffer> {
  const response = await fetchImpl(imageUrl);
  if (!response.ok) throw new Error(ADMIN_MESSAGE);
  return Buffer.from(await response.arrayBuffer());
}

export function setRaizManagedSession(input: RaizManagedSessionInput): RaizManagedSession {
  const token = asString(input.token);
  const expiresAt = asString(input.expiresAt);
  if (!token || !expiresAt || isExpired(expiresAt)) {
    throw new Error('Invalid Raiz managed session');
  }

  const session: RaizManagedSession = {
    token,
    expiresAt,
  };
  const workspaceId = asString(input.workspaceId);
  if (workspaceId) session.workspaceId = workspaceId;
  const raizPlatformOrigin = asString(input.raizPlatformOrigin);
  if (raizPlatformOrigin) session.raizPlatformOrigin = raizPlatformOrigin;
  const mediaGateway = parseMediaGateway(input.mediaGateway);
  if (mediaGateway) session.mediaGateway = mediaGateway;
  currentSession = session;
  return session;
}

export function getRaizManagedSession(): RaizManagedSession | null {
  if (currentSession && isExpired(currentSession.expiresAt)) {
    currentSession = null;
  }
  return currentSession;
}

export function clearRaizManagedSession(): void {
  currentSession = null;
}

export function isRaizManagedRuntimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RAIZ_MANAGED_RUNTIME === '1' || env.RAIZ_MANAGED_RUNTIME === 'true';
}

export async function generateRaizManagedImage(
  args: GenerateRaizManagedImageArgs,
): Promise<ProjectFileMeta & { model: string; surface: 'image'; providerNote: string; providerId: string }> {
  const session = args.session;
  if (!session) throw new Error(SESSION_MESSAGE);

  const prompt = asString(args.prompt);
  if (!prompt) throw new Error('Prompt de imagem obrigatorio.');

  const allowedModels = session.mediaGateway?.allowedImageModels ?? [DEFAULT_IMAGE_MODEL];
  const model = asString(args.model) || session.mediaGateway?.defaultImageModel || DEFAULT_IMAGE_MODEL;
  if (!allowedModels.includes(model)) {
    throw new Error('Modelo de imagem indisponivel no modo gerenciado pelo Raiz.');
  }

  const allowedSurfaces = session.mediaGateway?.allowedSurfaces ?? ['image'];
  if (!allowedSurfaces.includes('image')) {
    throw new Error('Geracao de imagem indisponivel para esta sessao.');
  }

  args.onProgress?.('Encaminhando geracao de imagem pelo gateway gerenciado do Raiz.');

  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(resolveForwardUrl(session, args.raizDaemonUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId: session.workspaceId,
      surface: 'image',
      prompt,
      model,
      size: imageSizeFromAspect(args.aspect),
      outputFormat: 'png',
      metadata: {
        projectId: args.projectId,
        source: 'open-design-raiz-managed',
      },
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || asObject(body)?.success !== true) {
    throw new Error(sanitizeError(extractErrorMessage(body)));
  }

  const data = asObject(asObject(body)?.data);
  const imageBase64 = asString(data?.imageBase64);
  const imageUrl = asString(data?.imageUrl);
  const bytes = imageBase64
    ? Buffer.from(imageBase64, 'base64')
    : imageUrl
      ? await fetchImageUrl(fetchImpl, imageUrl)
      : null;
  if (!bytes || bytes.byteLength === 0) throw new Error(ADMIN_MESSAGE);

  const file = await args.writeProjectFile(
    args.projectsRoot,
    args.projectId,
    outputName(args.output),
    bytes,
  );

  return {
    ...file,
    model,
    surface: 'image',
    providerNote: session.mediaGateway?.providerLabel || 'Gerenciado pelo Raiz',
    providerId: 'raiz',
  };
}
