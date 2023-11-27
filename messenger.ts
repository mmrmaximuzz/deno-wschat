export interface Messenger {
  register(sock: WebSocket): void;
}

export function createMessenger() {
  return {
    _clients: new Map<string, WebSocket>(),

    _addClient(nick: string, client: WebSocket): boolean {
      if (this._clients.has(nick)) {
        return false;
      }

      console.log("Messenger: logging in: " + nick);

      // send ourselves a full client list.
      client.send(JSON.stringify({
        type: "userlist",
        list: Array.from(this._clients.keys()),
      }));

      // Add ourselves to the client list, then notify.
      // In this way we will get notification about self-join.
      this._clients.set(nick, client);
      this._clients.forEach((sock: WebSocket) => {
        sock.send(JSON.stringify({
          type: "join",
          nick,
        }));
      });

      return true;
    },

    _delClient(nick: string): boolean {
      if (!this._clients.delete(nick)) {
        return false;
      }

      console.log("Messenger: leaving: " + nick);

      this._clients.forEach((sock: WebSocket) => {
        sock.send(JSON.stringify({
          type: "leave",
          nick,
        }));
      });

      return true;
    },

    _broadcastMessage(nick: string, text: string): void {
      console.log("Messenger: message from: " + nick);

      this._clients.forEach((sock: WebSocket) => {
        sock.send(JSON.stringify({
          type: "message",
          nick,
          text,
        }));
      });
    },

    register(sock: WebSocket): void {
      let nick: string | null = null;

      sock.onopen = () => {
        console.log("Messenger: connected websocket");
      };

      sock.onclose = () => {
        if (nick !== null) {
          this._delClient(nick);
        }
      };

      sock.onmessage = (data: { data: string }) => {
        // use unknown to allow TypeScript to check me
        const info: unknown = JSON.parse(data.data);
        if (typeof info !== "object" || info === null) {
          console.log("Messenger: malformed JSON data: " + data.data);
          return;
        }

        if (nick === null) {
          // not logged in, nickname is expected
          if (
            !("type" in info && "nick" in info) ||
            info.type !== "login" ||
            typeof info.nick !== "string"
          ) {
            console.log("Messenger: malformed login data: " + data.data);
            return;
          }

          nick = info.nick; // switch the state to logged in
          this._addClient(nick, sock);
        } else {
          // logged in, waiting for a message
          if (
            !("type" in info && "text" in info) || info.type !== "message" ||
            typeof info.text != "string"
          ) {
            console.log("Messenger: malformed message data: " + data.data);
            return;
          }

          this._broadcastMessage(nick, info.text);
        }
      };
    },
  };
}
