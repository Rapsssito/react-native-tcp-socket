# Cross-Platform examples <!-- omit in toc -->

In this folder, you can find a variety of examples to help you get started in using `react-native-tcp-socket`. Every example has a specific purpose and **is compatible** with Node.js.

In order to run an example, you may import the `init`, `server` and clients from the example file and run it either from React Native ([`App.js`](../App.js)) or Node.js ([`main`](main.js)).

Let us know if you find any issues. If you want to contribute or add a new example, feel free to submit a PR!

## Table of Contents <!-- omit in toc -->
- [Echo server](#echo-server)


### [Echo server](echo.js)

An echo server just reflects a message received from a client to the same client. If we send a message saying "Hello, Server!", we will receive the same message, just like an echo. This example shows some basic TCP server and client interactions.