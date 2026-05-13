import { afterEach, describe, expect, it } from 'vitest';
import {
  applyRaizContextToConfig,
  buildRaizSessionAckMessage,
  getRaizParentTargetOrigin,
  isRaizEmbeddedMode,
  parseRaizBridgeMessage,
  RAIZ_BRIDGE_MESSAGE_TYPE,
  RAIZ_SESSION_ACK_MESSAGE_TYPE,
} from '../../../src/integrations/raiz/bridge';
import type { AppConfig } from '../../../src/types';

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProtocol: 'anthropic',
  apiVersion: '',
  apiProtocolConfigs: {},
  configMigrationVersion: 1,
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  theme: 'system',
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

describe('Raiz bridge', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGIN;
  });

  it('detects Raiz embedded mode from search params', () => {
    expect(isRaizEmbeddedMode('?embed=raiz')).toBe(true);
    expect(isRaizEmbeddedMode('?embed=open-design')).toBe(false);
  });

  it('parses safe Raiz bridge session payloads', () => {
    const context = parseRaizBridgeMessage(
      {
        type: RAIZ_BRIDGE_MESSAGE_TYPE,
        version: 1,
        token: 'jwt-token',
        expiresAt: '2026-05-11T21:00:00.000Z',
        locale: 'pt-BR',
        theme: 'dark',
        accentColor: '#F7941D',
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workspace: { id: '11111111-1111-4111-8111-111111111111', name: 'Design' },
        capabilities: {
          artifactsWrite: true,
          managedSettings: ['locale', 'theme', 'accentColor', 'unsafe'],
        },
      },
      'http://localhost:3000'
    );

    expect(context?.locale).toBe('pt-BR');
    expect(context?.theme).toBe('dark');
    expect(context?.accentColor).toBe('#f7941d');
    expect(context?.capabilities.artifactsWrite).toBe(true);
    expect(context?.capabilities.managedSettings).toEqual(['locale', 'theme', 'accentColor']);
  });

  it('uses an allowlisted raizOrigin query param when document referrer is unavailable', () => {
    process.env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGIN = 'https://cowork.raizeducacao.com.br';

    expect(
      getRaizParentTargetOrigin(
        '?embed=raiz&raizOrigin=https%3A%2F%2Fcowork.raizeducacao.com.br%2Fcowork%2Fdesign'
      )
    ).toBe('https://cowork.raizeducacao.com.br');
  });

  it('rejects non-allowlisted raizOrigin query params', () => {
    process.env.NEXT_PUBLIC_RAIZ_PLATFORM_ORIGIN = 'https://cowork.raizeducacao.com.br';

    expect(
      getRaizParentTargetOrigin('?embed=raiz&raizOrigin=https%3A%2F%2Fevil.example')
    ).toBeNull();
  });

  it('ignores invalid payloads', () => {
    expect(
      parseRaizBridgeMessage(
        { type: RAIZ_BRIDGE_MESSAGE_TYPE, version: 1 },
        'http://localhost:3000'
      )
    ).toBeNull();
    expect(
      parseRaizBridgeMessage({ type: 'other', version: 1 }, 'http://localhost:3000')
    ).toBeNull();
  });

  it('applies only safe appearance settings to config', () => {
    const context = parseRaizBridgeMessage(
      {
        type: RAIZ_BRIDGE_MESSAGE_TYPE,
        version: 1,
        token: 'jwt-token',
        expiresAt: '2026-05-11T21:00:00.000Z',
        locale: 'pt-BR',
        theme: 'light',
        accentColor: '#F7941D',
        capabilities: { artifactsWrite: false, managedSettings: [] },
      },
      'http://localhost:3000'
    );

    const next = applyRaizContextToConfig(baseConfig, context);

    expect(next.theme).toBe('light');
    expect(next.accentColor).toBe('#f7941d');
    expect(next.apiKey).toBe('');
    expect(next.designSystemId).toBeNull();
  });

  it('builds session ack messages without exposing the token', () => {
    const context = parseRaizBridgeMessage(
      {
        type: RAIZ_BRIDGE_MESSAGE_TYPE,
        version: 1,
        token: 'jwt-token',
        expiresAt: '2026-05-11T21:00:00.000Z',
        locale: 'pt-BR',
        capabilities: { artifactsWrite: false, managedSettings: [] },
      },
      'https://cowork.raizeducacao.com.br'
    );

    expect(context).not.toBeNull();
    expect(buildRaizSessionAckMessage(context!)).toEqual({
      type: RAIZ_SESSION_ACK_MESSAGE_TYPE,
      version: 1,
      expiresAt: '2026-05-11T21:00:00.000Z',
    });
    expect(JSON.stringify(buildRaizSessionAckMessage(context!))).not.toContain('jwt-token');
  });
});
