// Execute this file using NodeJS
const { init, server, client } = require('./pause-resume');

server.on('connection', (socket) => {
    console.log('Client connected to server on ' + JSON.stringify(socket.address()));

    socket.on('data', (data) => {
        console.log('Server client received: ' + data);
    });

    socket.on('error', (error) => {
        console.log('Server client error ' + error);
    });

    socket.on('close', (error) => {
        console.log('Server client closed ' + (error ? error : ''));
    });
});

server.on('error', (error) => {
    console.log('Server error ' + error);
});

server.on('close', () => {
    console.log('Server closed');
});

client.on('connect', () => {
    console.log('Opened client on ' + JSON.stringify(client.address()));
});

client.on('drain', () => {
    console.log('Client drained');
});

client.on('data', (data) => {
    console.log('Client received: ' + data);
});

client.on('error', (error) => {
    console.log('Client error ' + error);
});

client.on('close', (error) => {
    console.log('Client closed ' + (error ? error : ''));
});

init();