const LOCAL_NETWORK_ACCESS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const LOCAL_NETWORK_ACCESS_HEADERS =
  'Authorization, Content-Type, X-Raiz-User-Id, X-Raiz-Proxy, X-Requested-With';
const LOCAL_NETWORK_ACCESS_VARY =
  'Origin, Access-Control-Request-Private-Network, Access-Control-Request-Method, Access-Control-Request-Headers';

function readCsvEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedLocalNetworkAccessOrigins(
  env: Record<string, string | undefined> = process.env,
): Set<string> {
  const origins = [
    ...readCsvEnv(env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGIN),
    ...readCsvEnv(env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGINS),
    ...readCsvEnv(env.OD_ALLOWED_ORIGINS),
  ]
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin != null);

  return new Set(origins);
}

export function isAllowedLocalNetworkAccessOrigin(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!origin) return false;
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  return allowedLocalNetworkAccessOrigins(env).has(normalizedOrigin);
}

export function localNetworkAccessHeaders(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): Headers | null {
  if (!origin || !isAllowedLocalNetworkAccessOrigin(origin, env)) return null;

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', new URL(origin).origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Private-Network', 'true');
  headers.set('Access-Control-Allow-Methods', LOCAL_NETWORK_ACCESS_METHODS);
  headers.set('Access-Control-Allow-Headers', LOCAL_NETWORK_ACCESS_HEADERS);
  headers.set('Access-Control-Max-Age', '600');
  headers.set('Vary', LOCAL_NETWORK_ACCESS_VARY);
  return headers;
}
