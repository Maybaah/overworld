import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from './ShareButton';
import type { CardSpec } from './card';

const card: CardSpec = { kind: 'guess', total: 100, max: 25000, rows: [{ distance: '1. 5 km', score: '100' }] };
const LINK = 'https://example.com/overworld/g/1/';

const fakeBlob = new Blob(['png'], { type: 'image/png' });
let toBlob: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toBlob = vi.fn((cb: (b: Blob | null) => void, type?: string) => cb(type === 'image/png' ? fakeBlob : null));
  const ctx = new Proxy(
    { measureText: () => ({ width: 10 }) } as Record<string | symbol, unknown>,
    {
      get: (t, k) => (k in t ? t[k] : vi.fn()),
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob as never);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function open() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<ShareButton url={LINK} title="Game One" card={card} />);
  await user.click(screen.getByRole('button', { name: 'Share' }));
  return user;
}

describe('ShareButton', () => {
  it('copies the link and announces it', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(LINK);
    await waitFor(() => expect(screen.getByText(/./, { selector: '.ow-share-live' })).toHaveTextContent('Link copied'));
  });

  it('announces a failed copy', async () => {
    writeText.mockRejectedValue(new Error('no'));
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(screen.getByText(/./, { selector: '.ow-share-live' })).toHaveTextContent('Could not copy'));
  });

  it('shows the native share option only when navigator.share exists', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();
    cleanup();
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    await open();
    expect(screen.getByRole('button', { name: 'Share…' })).toBeInTheDocument();
  });

  it('shares the link with the image when files are allowed', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => true), configurable: true });
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Share…' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const arg = share.mock.calls[0]![0];
    expect(arg.url).toBe(LINK);
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].type).toBe('image/png');
  });

  it('shares just the link when files are not allowed', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => false), configurable: true });
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Share…' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0]![0]).toEqual({ title: 'Game One', url: LINK });
  });

  it('downloads a PNG made from the canvas', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Download image' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(URL.createObjectURL).toHaveBeenCalledWith(fakeBlob);
    expect(screen.getByText(/./, { selector: '.ow-share-live' })).toHaveTextContent('Image downloaded');
  });
});
