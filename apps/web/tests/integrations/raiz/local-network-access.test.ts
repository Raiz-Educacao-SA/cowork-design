import { describe, expect, it } from 'vitest';
import {
  allowedLocalNetworkAccessOrigins,
  isAllowedLocalNetworkAccessOrigin,
  localNetworkAccessHeaders,
} from '../../../src/integrations/raiz/local-network-access';

const env = {
  NEXT_PUBLIC_RAIZ_PLATFORM_ORIGIN: 'https://cowork.raizeducacao.com.br',
  NEXT_PUBLIC_RAIZ_PLATFORM_ORIGINS:
    'https://cowork.raizeducacao.com.br, http://localhost:3000',
  OD_ALLOWED_ORIGINS: 'https://preview.example.com',
};

describe('Raiz local network access headers', () => {
  it('builds an exact allowed-origin set from configured Raiz origins', () => {
    expect([...allowedLocalNetworkAccessOrigins(env)].sort()).toEqual([
      'http://localhost:3000',
      'https://cowork.raizeducacao.com.br',
      'https://preview.example.com',
    ]);
  });

  it('allows only explicitly configured origins', () => {
    expect(isAllowedLocalNetworkAccessOrigin('https://cowork.raizeducacao.com.br', env)).toBe(
      true
    );
    expect(isAllowedLocalNetworkAccessOrigin('https://evil.example.com', env)).toBe(false);
  });

  it('returns PNA/CORS headers without wildcard origins', () => {
    const headers = localNetworkAccessHeaders('https://cowork.raizeducacao.com.br', env);

    expect(headers?.get('access-control-allow-origin')).toBe(
      'https://cowork.raizeducacao.com.br'
    );
    expect(headers?.get('access-control-allow-private-network')).toBe('true');
    expect(headers?.get('access-control-allow-credentials')).toBe('true');
    expect(headers?.get('access-control-allow-origin')).not.toBe('*');
  });

  it('does not return headers for unconfigured origins', () => {
    expect(localNetworkAccessHeaders('https://evil.example.com', env)).toBeNull();
  });
});
