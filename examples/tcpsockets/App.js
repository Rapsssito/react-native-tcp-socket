/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { init, server, client } from './examples/client-ssl';

class App extends React.Component {
    /**
     * @param {any} props
     */
    constructor(props) {
        super(props);

        this.updateChatter = this.updateChatter.bind(this);
        this.state = { chatter: [] };
    }

    /**
     * @param {string | Error} msg
     */
    updateChatter(msg) {
        console.log(msg);
        this.setState({
            // @ts-ignore
            chatter: this.state.chatter.concat([msg]),
        });
    }

    componentDidMount() {
        server.on('connection', (socket) => {
            this.updateChatter('Client connected to server on ' + JSON.stringify(socket.address()));

            socket.on('data', (data) => {
                this.updateChatter('Server client received: ' + (data.length < 500 ? data : data.length + ' bytes'));
            });

            socket.on('error', (error) => {
                this.updateChatter('Server client error ' + error);
            });

            socket.on('close', (error) => {
                this.updateChatter('Server client closed ' + (error ? error : ''));
            });
        });

        server.on('error', (error) => {
            this.updateChatter('Server error ' + error);
        });

        server.on('close', () => {
            this.updateChatter('Server closed');
        });

        client.on('connect', () => {
            this.updateChatter('Opened client on ' + JSON.stringify(client.address()));
        });

        client.on('drain', () => {
            this.updateChatter('Client drained');
        });

        client.on('data', (data) => {
            this.updateChatter('Client received: ' + (data.length < 500 ? data : data.length + ' bytes'));
        });

        client.on('error', (error) => {
            this.updateChatter('Client error ' + error);
        });

        client.on('close', (error) => {
            this.updateChatter('Client closed ' + (error ? error : ''));
        });

        init();
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
