interface IBroadcastJS {
    close: () => void;
    postMessage: (message: Message) => void;
    onMessage: (messageName: string, onReceive: (message: Message) => void) => void;
    canBrowserSupportBroadcastJS: () => boolean;
    hasListeners: (messageName: string) => boolean;
}

export interface Message<T = unknown> {
    message: string;
    data: T;
    isInternal?: boolean;
}

enum InternalMessages {
    RemoveMessage = "removeMessage"
}

interface BroadcastHandlers {
    onBeforeSendMessage?: (message: Message) => void;
    onAfterSendMessage?: (message: Message) => void;
    onBeforePostMessage?: (message: Message) => void;
    onAfterPostMessage?: (message: Message) => void;
    onBeforeClose?: () => void;
    onAfterClose?: () => void;
    onError?: (message: Message) => void;
}

type SerializedMessage = string;

export class BroadcastJS implements IBroadcastJS {
    private static bcInstance: BroadcastChannel;
    private static bcJSInstance: BroadcastJS;
    private static messageCallbacks: Map<string, (message: Message) => void> = new Map();
    private static handlers: BroadcastHandlers = {};
    constructor(name: string, handlers?: BroadcastHandlers) {
        if (!this.canBrowserSupportBroadcastJS()) {
            throw new Error('BroadcastChannel API is not supported in this browser');
        }
        if (BroadcastJS.bcJSInstance) {
            return BroadcastJS.bcJSInstance;
        }

        if (!BroadcastJS.bcInstance) {
            const broadcast = new BroadcastChannel(name);
            BroadcastJS.bcInstance = broadcast;
        }
        BroadcastJS.handlers = handlers || {};
        BroadcastJS.bcJSInstance = this;
        return BroadcastJS.bcJSInstance;
    }

    /**
     * Closes the broadcast channel.
     *
     * @returns {void}
     *
     * @example
     * const broadcast = new BroadcastJS("channelName");
     * broadcast.close();
     */

    public close(): void {
        BroadcastJS.handlers.onBeforeClose?.();
        BroadcastJS.bcInstance.close();
        BroadcastJS.messageCallbacks.clear();
        BroadcastJS.handlers = {};
        BroadcastJS.handlers.onAfterClose?.();
    }

    /**
     * Posts a message to the broadcast channel.
     *
     * @param {Message} message - The message to post.
     * @returns {void}
     * 
     * @example
     * const broadcast = new BroadcastJS("channelName");
     * broadcast.postMessage({ message: "message", data: { count: 0 } });
     */
    public postMessage(message: Message): void {
        const serializedMessage = this.createSerializedMessage(message.message, message.data, false);
        BroadcastJS.handlers.onBeforePostMessage?.(message);
        BroadcastJS.bcInstance.postMessage(serializedMessage);
        BroadcastJS.handlers.onAfterPostMessage?.(message);
    }


    /**
     * Calls a callback when a message is received.
     *
     * @param {string} messageName - The name of the message to call the callback for.
     * @param {function} onRecieve - The callback to call when a message is received.
     * @returns {void}
     *
     * @example
     * const broadcast = new BroadcastJS("channelName");
     * broadcast.onMessage("name", (message) => {
     *     console.log(message);
     * });
     */

    public onMessage<T>(messageName: string, onRecieve: (message: Message<T>) => void): void {
        BroadcastJS.messageCallbacks.set(messageName, onRecieve as (message: Message) => void);

        BroadcastJS.bcInstance.onmessage = (event: MessageEvent) => {
            const receivedMessage = JSON.parse(event.data) as Message;
            const message = this.createMessage(receivedMessage.message, receivedMessage.data, receivedMessage.isInternal ?? false);
            if (message.isInternal) {
                BroadcastJS.internalMessage(message.message as InternalMessages, message);
                return;
            }

            // calling the proper callback based on the message name
            const callback = BroadcastJS.messageCallbacks.get(receivedMessage.message);
            if (callback) {
                BroadcastJS.handlers.onBeforeSendMessage?.(message);
                callback(message);
                BroadcastJS.handlers.onAfterSendMessage?.(message);
            } else {
                BroadcastJS.handlers.onError?.(message);
                console.error("No callback found for message with name: ", receivedMessage.message);
            }
        };
    }

    public removeMessage(messageName: string): void {
        const serializedMessage = this.createSerializedMessage(InternalMessages.RemoveMessage, messageName, true);
        BroadcastJS.bcInstance.postMessage(serializedMessage);
        BroadcastJS.messageCallbacks.delete(messageName);
    }

    public canBrowserSupportBroadcastJS(): boolean {
        return typeof BroadcastChannel !== 'undefined';
    }

    public hasListeners(messageName: string): boolean {
        return BroadcastJS.messageCallbacks.has(messageName);
    }

    private static internalMessage(messageName: InternalMessages, message: Message): boolean {
        let isInternalMessage = false;
        switch (messageName) {
            case InternalMessages.RemoveMessage:
                // remove the message from the messageCallbacks
                BroadcastJS.messageCallbacks.delete(message.data as string);
                isInternalMessage = true;
                break;
            default:
                isInternalMessage = false;
                break;
        }
        return isInternalMessage;
    }

    // manual serialization to make it predictable
    private createMessage(name: string, data: unknown, isInternal: boolean): Message {
        const message = {
            message: name,
            data: data,
            isInternal: isInternal
        }
        return message
    }

    private createSerializedMessage(name: string, data: unknown, isInternal: boolean): SerializedMessage {
        const message = this.createMessage(name, data, isInternal);
        return JSON.stringify(message);
    }

}