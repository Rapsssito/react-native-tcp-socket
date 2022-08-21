# Cross-Platform examples <!-- omit in toc -->

In this folder, you can find a variety of examples to help you get started in using `react-native-tcp-socket`. Every example has a specific purpose and **is compatible** with Node.js.

In order to run an example, you may import the `init`, `server` and clients from the example file and run it either from React Native ([`App.js`](../App.js)) or Node.js ([`main.js`](main.js)).

Let us know if you find any issues. If you want to contribute or add a new example, feel free to submit a PR!

## Table of Contents <!-- omit in toc -->
- [Echo server](#echo-server)
- [Pause/Resume - Backpressure](#pauseresume---backpressure)
- [Long data](#long-data)
- [Client SSL](#client-ssl)
- [Server SSL](#server-ssl)
- [Echo SSL](#echo-ssl)


### [Echo server](echo.js)

An echo server just reflects a message received from a client to the same client. If we send a message saying "Hello, Server!", we will receive the same message, just like an echo. This example shows some basic TCP server and client interactions.

### [Pause/Resume - Backpressure](pause-resume.js)
There is a general problem that occurs during data handling called **backpressure** and describes a buildup of data behind a buffer during data transfer. When the receiving end of the transfer has complex operations, or is slower for whatever reason, there is a tendency for data from the incoming source to accumulate, like a clog.

To solve this problem, there must be a delegation system in place to ensure a smooth flow of data from one source to another and is often times referred to as flow control. In Node.js, streams have been the adopted solution and `react-native-tcp-socket` mimics the same functionality. If a call to `socket.write(chunk)` returns `false`, the `'drain'` event will be emitted when it is appropriate to resume writing data to the stream.

### [Long data](long-data.js)

A long data example that shows how large amounts of data are handled by listening to the `'drain'` event.

### [Client SSL](client-ssl.js)

An SSL client.

### [Server SSL](server-ssl.js)

An SSL server.

### [Echo SSL](echo-ssl.js)

Same as the [echo example](#echo-server), but with SSL.
