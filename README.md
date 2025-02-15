# js-broadcast-channel

A lightweight TypeScript library for cross-tab communication using the BroadcastChannel API. This package provides a simple interface for sending and receiving messages between different browser tabs or windows.

## Installation

npm install js-broadcast-channel

## Features

- 🚀 Simple and intuitive API
- 📦 TypeScript support out of the box
- 🔄 Cross-tab communication
- 🎯 Message-specific callbacks
- ⚡ Lightweight with zero dependencies
- 🎭 Built-in message handlers and lifecycle hooks

## Usage

### Basic Usage

```typescript
import { BroadcastJS } from 'js-broadcast-channel';
// Initialize BroadcastJS with a channel name
const broadcast = new BroadcastJS('my-channel');
// Send a message
broadcast.postMessage({
message: 'update-count',
data: { count: 42 }
});
// Listen for messages
broadcast.onMessage('update-count', (message) => {
console.log('Received count:', message.data.count);
});

```

## API Reference

### Constructor

```typescript
new BroadcastJS(name: string, handlers?: BroadcastHandlers)
```


#### Handlers (Optional)
- `onBeforeSendMessage`: Called before a message is sent
- `onAfterSendMessage`: Called after a message is sent
- `onBeforePostMessage`: Called before posting a message
- `onAfterPostMessage`: Called after posting a message
- `onBeforeClose`: Called before closing the channel
- `onAfterClose`: Called after closing the channel
- `onError`: Called when an error occurs

### Methods

#### `postMessage(message: Message)`
Sends a message to all other tabs/windows listening on the same channel.


```typescript
interface Message<T = unknown> {
message: string;
data: T;
}
```

#### `onMessage<T>(messageName: string, callback: (message: Message<T>) => void)`
Registers a callback for a specific message type.

#### `close()`
Closes the broadcast channel and cleans up resources.

#### `hasListeners(messageName: string)`
Checks if there are any listeners for a specific message.

#### `canBrowserSupportBroadcastJS()`
Checks if the browser supports the BroadcastChannel API.

#### `removeMessage(messageName: string)`
Removes a message listener.

## Example with Handlers

```typescript
const broadcast = new BroadcastJS('my-channel', {
onBeforeSendMessage: (message) => {
console.log('About to send:', message);
},
onAfterSendMessage: (message) => {
console.log('Message sent:', message);
},
onError: (message) => {
console.error('Error processing message:', message);
}
});

```

## Browser Support

This package requires browser support for the BroadcastChannel API. Check [Can I Use](https://caniuse.com/?search=broadcastchannel) for browser compatibility.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Author

Alireza Valipour