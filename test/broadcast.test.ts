import { BroadcastJS, Message } from '../src/broadcast';
import * as packageExports from '../src/index';

function resetBroadcastJS(): void {
  const internals = BroadcastJS as any;
  try {
    internals.bcInstance?.close();
  } catch {
    // channel may already be closed
  }
  internals.bcInstance = undefined;
  internals.bcJSInstance = undefined;
  internals.messageCallbacks = new Map();
  internals.handlers = {};
}

function postFromPeer(channelName: string, message: Message): void {
  const peer = new BroadcastChannel(channelName);
  peer.postMessage(JSON.stringify(message));
  peer.close();
}

function waitForCallback(
  register: (resolve: (message: Message) => void) => void,
  timeoutMs = 1000
): Promise<Message> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
    register((message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('package exports', () => {
  it('re-exports BroadcastJS from the package entry', () => {
    expect(packageExports.BroadcastJS).toBe(BroadcastJS);
  });
});

describe('BroadcastJS', () => {
  const channelName = 'test-channel';

  beforeEach(() => {
    resetBroadcastJS();
  });

  afterEach(() => {
    resetBroadcastJS();
  });

  describe('constructor', () => {
    it('creates an instance when BroadcastChannel is supported', () => {
      const broadcast = new BroadcastJS(channelName);
      expect(broadcast).toBeInstanceOf(BroadcastJS);
      expect(broadcast.canBrowserSupportBroadcastJS()).toBe(true);
    });

    it('returns the same singleton instance on subsequent constructions', () => {
      const first = new BroadcastJS(channelName);
      const second = new BroadcastJS('another-channel');
      expect(second).toBe(first);
    });

    it('ignores handlers from a later constructor call because of the singleton', () => {
      const firstHandler = jest.fn();
      const secondHandler = jest.fn();
      const first = new BroadcastJS(channelName, { onBeforePostMessage: firstHandler });
      new BroadcastJS(channelName, { onBeforePostMessage: secondHandler });

      first.postMessage({ message: 'ping', data: 1 });

      expect(firstHandler).toHaveBeenCalledTimes(1);
      expect(secondHandler).not.toHaveBeenCalled();
    });

    it('throws when BroadcastChannel is not supported', () => {
      const original = globalThis.BroadcastChannel;
      // @ts-expect-error intentionally remove browser API for this test
      delete globalThis.BroadcastChannel;

      expect(() => new BroadcastJS(channelName)).toThrow(
        'BroadcastChannel API is not supported in this browser'
      );

      globalThis.BroadcastChannel = original;
    });

    it('works when handlers are omitted', () => {
      expect(() => new BroadcastJS(channelName)).not.toThrow();
      const broadcast = new BroadcastJS(channelName);
      expect(() => broadcast.postMessage({ message: 'ping', data: null })).not.toThrow();
    });
  });

  describe('onMessage / postMessage', () => {
    it('invokes the registered callback when a matching message is received', async () => {
      const broadcast = new BroadcastJS(channelName);
      const received = waitForCallback((resolve) => {
        broadcast.onMessage<{ count: number }>('update-count', resolve);
      });

      postFromPeer(channelName, {
        message: 'update-count',
        data: { count: 42 },
      });

      await expect(received).resolves.toEqual({
        message: 'update-count',
        data: { count: 42 },
        isInternal: false,
      });
    });

    it('defaults isInternal to false when the peer omits it', async () => {
      const broadcast = new BroadcastJS(channelName);
      const received = waitForCallback((resolve) => {
        broadcast.onMessage('ping', resolve);
      });

      const peer = new BroadcastChannel(channelName);
      peer.postMessage(JSON.stringify({ message: 'ping', data: 'x' }));
      peer.close();

      await expect(received).resolves.toEqual({
        message: 'ping',
        data: 'x',
        isInternal: false,
      });
    });

    it('delivers nested and array payloads', async () => {
      const broadcast = new BroadcastJS(channelName);
      const payload = {
        items: [{ id: 1 }, { id: 2 }],
        meta: { nested: true, values: [1, 2, 3] },
      };

      const received = waitForCallback((resolve) => {
        broadcast.onMessage('sync', resolve);
      });

      postFromPeer(channelName, { message: 'sync', data: payload });

      await expect(received).resolves.toEqual({
        message: 'sync',
        data: payload,
        isInternal: false,
      });
    });

    it('supports empty string message names', async () => {
      const broadcast = new BroadcastJS(channelName);
      const received = waitForCallback((resolve) => {
        broadcast.onMessage('', resolve);
      });

      postFromPeer(channelName, { message: '', data: 'empty-name' });

      await expect(received).resolves.toMatchObject({
        message: '',
        data: 'empty-name',
      });
    });

    it('routes different message names to different listeners', async () => {
      const broadcast = new BroadcastJS(channelName);
      const alpha = jest.fn();
      const beta = jest.fn();

      const bothReceived = Promise.all([
        new Promise<void>((resolve) => {
          broadcast.onMessage('alpha', (message) => {
            alpha(message);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          broadcast.onMessage('beta', (message) => {
            beta(message);
            resolve();
          });
        }),
      ]);

      postFromPeer(channelName, { message: 'alpha', data: 1 });
      postFromPeer(channelName, { message: 'beta', data: 2 });

      await bothReceived;

      expect(alpha).toHaveBeenCalledWith(expect.objectContaining({ message: 'alpha', data: 1 }));
      expect(beta).toHaveBeenCalledWith(expect.objectContaining({ message: 'beta', data: 2 }));
    });

    it('delivers sequential messages to the same listener', async () => {
      const broadcast = new BroadcastJS(channelName);
      const seen: unknown[] = [];

      const done = new Promise<void>((resolve) => {
        broadcast.onMessage('tick', (message) => {
          seen.push(message.data);
          if (seen.length === 3) {
            resolve();
          }
        });
      });

      postFromPeer(channelName, { message: 'tick', data: 1 });
      postFromPeer(channelName, { message: 'tick', data: 2 });
      postFromPeer(channelName, { message: 'tick', data: 3 });

      await done;
      expect(seen).toEqual([1, 2, 3]);
    });

    it('serializes postMessage so a peer channel can receive it', async () => {
      const broadcast = new BroadcastJS(channelName);
      const peer = new BroadcastChannel(channelName);

      const received = new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for peer message')), 1000);
        peer.onmessage = (event: MessageEvent) => {
          clearTimeout(timer);
          resolve(JSON.parse(event.data) as Message);
        };
      });

      broadcast.postMessage({ message: 'hello-peer', data: { ok: true } });

      await expect(received).resolves.toEqual({
        message: 'hello-peer',
        data: { ok: true },
        isInternal: false,
      });

      peer.close();
    });

    it('does not deliver a message to the sender instance itself', async () => {
      const broadcast = new BroadcastJS(channelName);
      const callback = jest.fn();
      broadcast.onMessage('self', callback);

      broadcast.postMessage({ message: 'self', data: 1 });
      await delay(50);

      expect(callback).not.toHaveBeenCalled();
    });

    it('replaces an existing listener for the same message name', async () => {
      const broadcast = new BroadcastJS(channelName);
      const first = jest.fn();
      const second = jest.fn();

      broadcast.onMessage('ping', first);
      const done = new Promise<Message>((resolve) => {
        broadcast.onMessage('ping', (message) => {
          second(message);
          resolve(message);
        });
      });

      postFromPeer(channelName, { message: 'ping', data: 'hello' });

      await expect(done).resolves.toMatchObject({ message: 'ping', data: 'hello' });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('calls onError when a message has no registered callback', async () => {
      const onError = jest.fn();
      const broadcast = new BroadcastJS(channelName, { onError });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      // attach the message handler by registering an unrelated listener
      broadcast.onMessage('known', () => undefined);

      await new Promise<void>((resolve) => {
        onError.mockImplementation(() => resolve());
        postFromPeer(channelName, { message: 'unknown', data: null });
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'unknown', data: null })
      );
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('does not call user listeners for internal messages', async () => {
      const broadcast = new BroadcastJS(channelName);
      const userCallback = jest.fn();
      broadcast.onMessage('rm', userCallback);

      postFromPeer(channelName, {
        message: 'rm',
        data: 'something',
        isInternal: true,
      });
      await delay(50);

      expect(userCallback).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle handlers', () => {
    it('runs postMessage lifecycle handlers in order', () => {
      const calls: string[] = [];
      const broadcast = new BroadcastJS(channelName, {
        onBeforePostMessage: () => calls.push('before'),
        onAfterPostMessage: () => calls.push('after'),
      });

      broadcast.postMessage({ message: 'ping', data: 1 });

      expect(calls).toEqual(['before', 'after']);
    });

    it('runs send lifecycle handlers when a message is delivered', async () => {
      const calls: string[] = [];
      const broadcast = new BroadcastJS(channelName, {
        onBeforeSendMessage: () => calls.push('before'),
        onAfterSendMessage: () => calls.push('after'),
      });

      const received = waitForCallback((resolve) => {
        broadcast.onMessage('ping', (message) => {
          calls.push('callback');
          resolve(message);
        });
      });

      postFromPeer(channelName, { message: 'ping', data: true });
      await received;

      expect(calls).toEqual(['before', 'callback', 'after']);
    });

    it('runs onBeforeClose when closing', () => {
      const onBeforeClose = jest.fn();
      const broadcast = new BroadcastJS(channelName, { onBeforeClose });

      broadcast.close();

      expect(onBeforeClose).toHaveBeenCalledTimes(1);
    });

    it('does not run onAfterClose because handlers are cleared first', () => {
      const onAfterClose = jest.fn();
      const broadcast = new BroadcastJS(channelName, { onAfterClose });

      broadcast.close();

      expect(onAfterClose).not.toHaveBeenCalled();
    });

    it('does not run send handlers for unknown messages', async () => {
      const onBeforeSendMessage = jest.fn();
      const onAfterSendMessage = jest.fn();
      const onError = jest.fn();
      const broadcast = new BroadcastJS(channelName, {
        onBeforeSendMessage,
        onAfterSendMessage,
        onError,
      });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      broadcast.onMessage('known', () => undefined);

      await new Promise<void>((resolve) => {
        onError.mockImplementation(() => resolve());
        postFromPeer(channelName, { message: 'missing', data: 0 });
      });

      expect(onBeforeSendMessage).not.toHaveBeenCalled();
      expect(onAfterSendMessage).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      (console.error as jest.Mock).mockRestore();
    });
  });

  describe('hasListeners / removeMessage', () => {
    it('reports whether a listener exists', () => {
      const broadcast = new BroadcastJS(channelName);
      expect(broadcast.hasListeners('ping')).toBe(false);

      broadcast.onMessage('ping', () => undefined);
      expect(broadcast.hasListeners('ping')).toBe(true);
    });

    it('tracks listeners independently per message name', () => {
      const broadcast = new BroadcastJS(channelName);
      broadcast.onMessage('a', () => undefined);

      expect(broadcast.hasListeners('a')).toBe(true);
      expect(broadcast.hasListeners('b')).toBe(false);
    });

    it('removes a local listener', () => {
      const broadcast = new BroadcastJS(channelName);
      broadcast.onMessage('ping', () => undefined);
      expect(broadcast.hasListeners('ping')).toBe(true);

      broadcast.removeMessage('ping');
      expect(broadcast.hasListeners('ping')).toBe(false);
    });

    it('stops delivering after removeMessage', async () => {
      const broadcast = new BroadcastJS(channelName);
      const callback = jest.fn();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      broadcast.onMessage('ping', callback);
      broadcast.removeMessage('ping');

      postFromPeer(channelName, { message: 'ping', data: 1 });
      await delay(50);

      expect(callback).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('broadcasts an internal remove message to peers', async () => {
      const broadcast = new BroadcastJS(channelName);
      broadcast.onMessage('ping', () => undefined);

      const peer = new BroadcastChannel(channelName);
      const received = new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for remove message')), 1000);
        peer.onmessage = (event: MessageEvent) => {
          clearTimeout(timer);
          resolve(JSON.parse(event.data) as Message);
        };
      });

      broadcast.removeMessage('ping');

      await expect(received).resolves.toEqual({
        message: 'rm',
        data: 'ping',
        isInternal: true,
      });

      peer.close();
    });

    it('removes a listener when a peer sends an internal remove message', async () => {
      const broadcast = new BroadcastJS(channelName);
      broadcast.onMessage('keep', () => undefined);
      broadcast.onMessage('drop', () => undefined);
      expect(broadcast.hasListeners('drop')).toBe(true);

      postFromPeer(channelName, {
        message: 'rm',
        data: 'drop',
        isInternal: true,
      });
      await delay(50);

      expect(broadcast.hasListeners('drop')).toBe(false);
      expect(broadcast.hasListeners('keep')).toBe(true);
    });

    it('is a no-op when removing a message that was never registered', () => {
      const broadcast = new BroadcastJS(channelName);
      expect(() => broadcast.removeMessage('missing')).not.toThrow();
      expect(broadcast.hasListeners('missing')).toBe(false);
    });
  });

  describe('close', () => {
    it('clears listeners', () => {
      const broadcast = new BroadcastJS(channelName);
      broadcast.onMessage('ping', () => undefined);
      expect(broadcast.hasListeners('ping')).toBe(true);

      broadcast.close();
      expect(broadcast.hasListeners('ping')).toBe(false);
    });

    it('clears all registered listeners at once', () => {
      const broadcast = new BroadcastJS(channelName);
      broadcast.onMessage('a', () => undefined);
      broadcast.onMessage('b', () => undefined);
      broadcast.onMessage('c', () => undefined);

      broadcast.close();

      expect(broadcast.hasListeners('a')).toBe(false);
      expect(broadcast.hasListeners('b')).toBe(false);
      expect(broadcast.hasListeners('c')).toBe(false);
    });
  });

  describe('canBrowserSupportBroadcastJS', () => {
    it('returns true when BroadcastChannel exists', () => {
      const broadcast = new BroadcastJS(channelName);
      expect(broadcast.canBrowserSupportBroadcastJS()).toBe(true);
    });

    it('returns false when BroadcastChannel is unavailable', () => {
      const broadcast = new BroadcastJS(channelName);
      const original = globalThis.BroadcastChannel;
      // @ts-expect-error intentionally remove browser API for this test
      delete globalThis.BroadcastChannel;

      expect(broadcast.canBrowserSupportBroadcastJS()).toBe(false);

      globalThis.BroadcastChannel = original;
    });
  });
});
