/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import TcpSocket from 'react-native-tcp-socket';

class App extends React.Component {
    constructor(props) {
        super(props);

        this.updateChatter = this.updateChatter.bind(this);
        this.state = { chatter: [] };
    }

    updateChatter(msg) {
        this.setState({
            chatter: this.state.chatter.concat([msg]),
        });
    }

    componentDidMount() {
        const serverPort = Number(9 + (Math.random() * 999).toFixed(0));
        const serverHost = '0.0.0.0';
        let client;
        const server = TcpSocket.createServer((socket) => {
            this.updateChatter('client connected to server on ' + JSON.stringify(socket.address()));
            console.log(
                'Server client',
                socket.localAddress,
                socket.localPort,
                socket.remoteAddress,
                socket.remotePort,
                socket.remoteFamily
            );

            socket.on('data', (data) => {
                this.updateChatter('Server Received: ' + data);
                socket.write('Echo server\r\n');
            });

            socket.on('error', (error) => {
                this.updateChatter('server client error ' + error);
            });

            socket.on('close', (error) => {
                this.updateChatter('server client closed ' + (error ? error : ''));
            });

            server.close();
            setTimeout(() => {
                const client2 = TcpSocket.createConnection(
                    {
                        port: serverPort,
                        host: serverHost,
                        localAddress: '127.0.0.1',
                        reuseAddress: true,
                        // localPort: 20000,
                        // interface: "wifi",
                        // tls: true
                    },
                    () => {
                        this.updateChatter('opened client on ' + JSON.stringify(client.address()));
                        client.write('Hello, server! Love, Client.');
                    }
                );

                client2.on('error', (error) => {
                    this.updateChatter('NEW CLIENT error ' + error);
                    socket.write('Hehehe', undefined, () => {
                        console.log(server._connections.size);
                        client.destroy();
                    });
                });
            }, 1000);
        }).listen({ port: serverPort, host: serverHost, reuseAddress: true }, () => {
            this.updateChatter('opened server on ' + JSON.stringify(server.address()));
        });

        server.on('error', (error) => {
            this.updateChatter('Server error ' + error);
        });

        server.on('close', () => {
            this.updateChatter('server close');
        });

        client = TcpSocket.createConnection(
            {
                port: serverPort,
                host: serverHost,
                localAddress: '127.0.0.1',
                reuseAddress: true,
                // localPort: 20000,
                // interface: "wifi",
                // tls: true
            },
            () => {
                this.updateChatter('opened client on ' + JSON.stringify(client.address()));
                client.write('Hello, server! Love, Client.');
            }
        );

        client.on('data', (data) => {
            console.log(
                'Initial client',
                client.localAddress,
                client.localPort,
                client.remoteAddress,
                client.remotePort,
                client.remoteFamily
            );
            this.updateChatter('Client Received: ' + data);
            // client.destroy(); // kill client after server's response
            // server.close();
        });

        client.on('error', (error) => {
            this.updateChatter('client error ' + error);
        });

        client.on('close', () => {
            this.updateChatter('client close');
        });
    }

    render() {
        return (
            <View style={styles.container}>
                <ScrollView>
                    {this.state.chatter.map((msg, index) => {
                        return (
                            <Text key={index} style={styles.welcome}>
                                {msg}
                            </Text>
                        );
                    })}
                </ScrollView>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5FCFF',
    },
    welcome: {
        fontSize: 20,
        textAlign: 'center',
        margin: 10,
    },
    instructions: {
        textAlign: 'center',
        color: '#333333',
        marginBottom: 5,
    },
});

export default App;
