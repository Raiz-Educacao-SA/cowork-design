// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import type { PromptTemplateDetail, PromptTemplateSummary } from '../../src/types';

const mocks = vi.hoisted(() => ({
  fetchPromptTemplate: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => {
  return {
    fetchPromptTemplate: mocks.fetchPromptTemplate,
  };
});

const summary: PromptTemplateSummary = {
  id: 'editorial-portrait',
  surface: 'image',
  title: 'Editorial portrait',
  summary: 'Portrait template',
  category: 'Portraits',
  tags: ['photo'],
  model: 'gpt-image-2',
  aspect: '1:1',
  source: {
    repo: 'open-design',
    license: 'MIT',
  },
};

const detail: PromptTemplateDetail = {
  ...summary,
  prompt: 'A close-up editorial portrait in soft natural light.',
};

let originalClipboard: PropertyDescriptor | undefined;
let originalExecCommand: PropertyDescriptor | undefined;

describe('PromptTemplatePreviewModal copy action', () => {
  beforeEach(() => {
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    mocks.fetchPromptTemplate.mockResolvedValue(detail);
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
    if (originalExecCommand) {
      Object.defineProperty(document, 'execCommand', originalExecCommand);
    } else {
      delete (document as { execCommand?: typeof document.execCommand }).execCommand;
    }
    cleanup();
    vi.clearAllMocks();
  });

  it('falls back without crashing when iframe permissions block navigator.clipboard', async () => {
    const { PromptTemplatePreviewModal } = await import(
      '../../src/components/PromptTemplatePreviewModal'
    );
    const writeText = vi
      .fn()
      .mockRejectedValue(new DOMException('Clipboard blocked', 'NotAllowedError'));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    render(
      <I18nProvider initial="en">
        <PromptTemplatePreviewModal summary={summary} onClose={() => {}} />
      </I18nProvider>,
    );

    await screen.findByText(detail.prompt);
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(detail.prompt);
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied!/i })).toBeTruthy();
    });
  });
});
