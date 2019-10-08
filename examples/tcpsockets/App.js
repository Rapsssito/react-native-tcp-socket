/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

var net = require('react-native-tcp-socket');

function randomPort() {
  return Math.random() * 60536 | 0 + 5000; // 60536-65536
}

class App extends React.Component {
  constructor(props) {
    super(props);

    this.updateChatter = this.updateChatter.bind(this);
    this.state = { chatter: [] };
  }

  updateChatter(msg) {
    this.setState({
      chatter: this.state.chatter.concat([msg])
    });
  }

  componentDidMount() {
    const serverPort = 5000;
    const serverHost = "192.168.1.42";
    let server;
    // let server = net.createServer((socket) => {
    //   this.updateChatter('server connected on ' + JSON.stringify(socket.address()));

    //   socket.on('data', (data) => {
    //     this.updateChatter('Server Received: ' + data);
    //     socket.write('Echo server\r\n');
    //   });

    //   socket.on('error', (error) => {
    //     this.updateChatter('error ' + error);
    //   });

    //   socket.on('close', (error) => {
    //     this.updateChatter('server client closed ' + (error ? error : ''));
    //   });
    // }).listen(serverPort, () => {
    //   this.updateChatter('opened server on ' + JSON.stringify(server.address()));
    // });

    // server.on('error', (error) => {
    //   this.updateChatter('error ' + error);
    // });

    // server.on('close', () => {
    //   this.updateChatter('server close');
    // });

    let client = net.createConnection({
      port: serverPort,
      host: serverHost,
      localAddress: "192.168.1.33",
      interface: "wifi"
    }, () => {
      this.updateChatter('opened client on ' + JSON.stringify(client.address()));
      client.write('Hello, server! Love, Client.');
    });

    client.on('data', (data) => {
      console.log(data.toString());
      this.updateChatter('Client Received: ' + data);

      this.client.destroy(); // kill client after server's response
      // this.server.close();
    });

    client.on('error', (error) => {
      console.log(error);
      this.updateChatter('client error ' + error);
    });

    client.on('close', () => {
      console.log("Client closed");
      this.updateChatter('client close');
    });

    this.server = server;
    this.client = client;
  }

  componentWillUnmount() {
    this.server = null;
    this.client = null;
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
};

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
