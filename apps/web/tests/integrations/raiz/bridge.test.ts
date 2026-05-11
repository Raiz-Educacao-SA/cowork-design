import { describe, expect, it } from 'vitest';
import {
  applyRaizContextToConfig,
  isRaizEmbeddedMode,
  parseRaizBridgeMessage,
  RAIZ_BRIDGE_MESSAGE_TYPE,
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
});
