import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRaizManagedSession,
  generateRaizManagedImage,
  getRaizManagedSession,
  isRaizManagedRuntimeEnabled,
  setRaizManagedSession,
} from '../src/raiz-managed-media.js';

describe('Raiz managed media', () => {
  afterEach(() => {
    clearRaizManagedSession();
    vi.restoreAllMocks();
  });

  it('stores the short session in memory only', () => {
    const session = setRaizManagedSession({
      token: 'short-lived-jwt',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceId: 'workspace-1',
      raizPlatformOrigin: 'https://cowork.raizeducacao.com.br',
      mediaGateway: {
        mode: 'daemon-forward',
        allowedImageModels: ['gpt-image-2'],
        allowedSurfaces: ['image'],
      },
    });

    expect(session.token).toBe('short-lived-jwt');
    expect(getRaizManagedSession()).toMatchObject({
      workspaceId: 'workspace-1',
      raizPlatformOrigin: 'https://cowork.raizeducacao.com.br',
    });
  });

  it('rejects expired sessions', () => {
    expect(() =>
      setRaizManagedSession({
        token: 'short-lived-jwt',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    ).toThrow('Invalid Raiz managed session');
  });

  it('detects managed runtime through environment', () => {
    expect(isRaizManagedRuntimeEnabled({ RAIZ_MANAGED_RUNTIME: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isRaizManagedRuntimeEnabled({ RAIZ_MANAGED_RUNTIME: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isRaizManagedRuntimeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('generates image through the Raiz daemon forwarder and writes the local file', async () => {
    const session = setRaizManagedSession({
      token: 'short-lived-jwt',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceId: 'workspace-1',
      mediaGateway: {
        mode: 'daemon-forward',
        generateEndpoint: '/api/cowork-design/media/generate',
        allowedImageModels: ['gpt-image-2'],
        allowedSurfaces: ['image'],
        providerLabel: 'Gerenciado pelo Raiz',
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            imageBase64: Buffer.from('png-bytes').toString('base64'),
            model: 'gpt-image-2',
          },
        }),
        { status: 200 },
      ),
    );
    const writeProjectFile = vi.fn().mockResolvedValue({
      name: 'portrait.png',
      size: 9,
      mtime: Date.now(),
      kind: 'image',
      mime: 'image/png',
    });

    const result = await generateRaizManagedImage({
      session,
      raizDaemonUrl: 'http://127.0.0.1:9876',
      projectsRoot: '/tmp/projects',
      projectId: 'project-1',
      prompt: 'A portrait',
      output: 'portrait.png',
      model: 'gpt-image-2',
      aspect: '1:1',
      fetchImpl,
      writeProjectFile,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:9876/api/cowork-design/media/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer short-lived-jwt',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const firstCall = fetchImpl.mock.calls[0];
    if (!firstCall) throw new Error('expected fetch call');
    const payload = JSON.parse(firstCall[1].body as string);
    expect(payload).toMatchObject({
      workspaceId: 'workspace-1',
      surface: 'image',
      prompt: 'A portrait',
      model: 'gpt-image-2',
      size: '1024x1024',
      outputFormat: 'png',
    });
    expect(writeProjectFile).toHaveBeenCalledWith(
      '/tmp/projects',
      'project-1',
      'portrait.png',
      Buffer.from('png-bytes'),
    );
    expect(result).toMatchObject({
      name: 'portrait.png',
      model: 'gpt-image-2',
      surface: 'image',
      providerNote: 'Gerenciado pelo Raiz',
      providerId: 'raiz',
    });
  });

  it('redacts provider secrets from gateway failures', async () => {
    const session = setRaizManagedSession({
      token: 'short-lived-jwt',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      mediaGateway: { allowedImageModels: ['gpt-image-2'], allowedSurfaces: ['image'] },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Provider key sk-testsecret1234567890 is invalid',
          },
        }),
        { status: 503 },
      ),
    );

    await expect(
      generateRaizManagedImage({
        session,
        raizDaemonUrl: 'http://127.0.0.1:9876',
        projectsRoot: '/tmp/projects',
        projectId: 'project-1',
        prompt: 'A portrait',
        model: 'gpt-image-2',
        fetchImpl,
        writeProjectFile: vi.fn(),
      }),
    ).rejects.toThrow('Provider key [REDACTED] is invalid');
  });
});
