import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canViewRaizProviderSettings,
  isRaizManagedMode,
  parseRaizBridgeMessage,
  syncRaizSessionToLocalDaemon,
} from '../src/integrations/raiz/bridge';

describe('Raiz embedded bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parses managed v2 capabilities used by the Raiz platform', () => {
    const context = parseRaizBridgeMessage(
      {
        type: 'raiz:cowork-design:session',
        version: 2,
        token: 'short-lived-jwt',
        expiresAt: '2026-05-13T23:59:00.000Z',
        locale: 'pt-BR',
        theme: 'system',
        raizPlatformOrigin: 'https://cowork.raizeducacao.com.br',
        capabilities: {
          artifactsWrite: true,
          managedSettings: ['locale', 'theme', 'accentColor', 'designSystemId', 'providerProfile'],
          media: ['text', 'image'],
          audioVideoEnabled: false,
          budgetScope: 'organization',
          managedProvider: true,
          managedRuntime: 'raiz-gateway',
          canEditProviderSettings: false,
          canViewProviderSettings: false,
          canOpenStandalone: false,
          hiddenSettingsSections: ['execution', 'media', 'composio', 'mcp', 'orbit'],
          keyRotationRole: 'super-admin',
        },
        mediaGateway: {
          mode: 'daemon-forward',
          generateEndpoint: '/api/raiz/media/generate',
          taskEndpoint: '/api/raiz/media/tasks',
          defaultImageModel: 'gpt-image-2',
          allowedImageModels: ['gpt-image-2'],
          allowedSurfaces: ['image'],
          providerLabel: 'Gerenciado pelo Raiz',
        },
      },
      'https://cowork.raizeducacao.com.br'
    );

    expect(context?.capabilities.managedRuntime).toBe('raiz-gateway');
    expect(context?.capabilities.canViewProviderSettings).toBe(false);
    expect(context?.capabilities.canOpenStandalone).toBe(false);
    expect(context?.capabilities.hiddenSettingsSections).toEqual(
      expect.arrayContaining(['execution', 'media', 'composio'])
    );
    expect(context?.mediaGateway).toMatchObject({
      mode: 'daemon-forward',
      defaultImageModel: 'gpt-image-2',
      allowedSurfaces: ['image'],
    });
  });

  it('treats embedded Raiz as managed until a bridge context arrives', () => {
    expect(isRaizManagedMode(null, true)).toBe(true);
    expect(canViewRaizProviderSettings(null, true)).toBe(false);
    expect(isRaizManagedMode(null, false)).toBe(false);
  });

  it('syncs the short Raiz session to the local daemon without provider secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const context = parseRaizBridgeMessage(
      {
        type: 'raiz:cowork-design:session',
        version: 2,
        token: 'short-lived-jwt',
        expiresAt: '2026-05-13T23:59:00.000Z',
        workspaceId: 'workspace-1',
        raizPlatformOrigin: 'https://cowork.raizeducacao.com.br',
        capabilities: {
          artifactsWrite: true,
          managedSettings: ['locale'],
          media: ['text', 'image'],
          audioVideoEnabled: false,
          managedProvider: true,
          managedRuntime: 'raiz-gateway',
        },
        mediaGateway: {
          mode: 'daemon-forward',
          generateEndpoint: '/api/cowork-design/media/generate',
          defaultImageModel: 'gpt-image-2',
          allowedImageModels: ['gpt-image-2'],
          allowedSurfaces: ['image'],
        },
      },
      'https://cowork.raizeducacao.com.br',
    );

    expect(context).not.toBeNull();
    await syncRaizSessionToLocalDaemon(context!);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/raiz/session',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch call');
    const init = firstCall[1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      token: 'short-lived-jwt',
      workspaceId: 'workspace-1',
      raizPlatformOrigin: 'https://cowork.raizeducacao.com.br',
    });
    expect(JSON.stringify(payload)).not.toMatch(/apiKey|secret|credential|OPENAI_API_KEY|providerToken/);
  });
});
