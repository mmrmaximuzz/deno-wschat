let socket = null;
let userList = null;

// color section
const colors = [
  "lightyellow",
  "lightskyblue",
  "violet",
  "honeydew",
  "gold",
  "mediumpurple",
  "lightgreen",
];

// let's recolorize each run
const seed = Math.floor(Math.random() * 65535);

function getColorForNickname(nick) {
  // select a color based on simple hashing function
  let hash = nick
    .split("")
    .reduce((prev, c) => (((prev << 5) - prev) + c.charCodeAt(0)) | 0, seed);

  // drop the sign bit if present
  hash &= (1 << 31) - 1;

  return colors[hash % colors.length];
}

function debug(msg) {
  const dd = document.getElementById("debug");
  if (dd === undefined || dd === null) {
    return;
  }

  // create nice looking debug string
  const date = new Date();
  const newMsg = document.createElement("div");
  newMsg.innerText = date.toLocaleString() + " - " + msg;
  newMsg.setAttribute("class", "debug-line");
  dd.appendChild(newMsg);
}

function getNickname() {
  return new URLSearchParams(window.location.search).get("nick");
}

// chat operations
function chatInputAction() {
  const input = document.getElementById("chat-input");
  if (input === null || input === undefined) {
    debug("cannot get input form");
    return;
  }

  if (socket === null) {
    debug("websocket is not connected yet");
    return;
  }

  const text = input.value;
  if (text === "") {
    // protect against sending empty messages
    return;
  }

  // clear the input to imitate message flush
  input.value = "";

  if (tryProcessMessengerCommand(text)) {
    // it was a messenger internal command, don't send to the server
    return;
  }

  // actual message, send it to the server
  socket.send(JSON.stringify({
    type: "message",
    text,
  }));
}

function addChatDivElement(styleClassName, text, color) {
  const chat = document.getElementById("chat-window");
  if (chat === null || chat === undefined) {
    debug("cannot get chat window ");
    return;
  }

  // create new elements
  const newMsg = document.createElement("div");
  const textDiv = document.createElement("div");
  const timeDiv = document.createElement("div");

  textDiv.innerText = text;

  const timeInfo = new Date().toLocaleTimeString();
  timeDiv.innerText = `[${timeInfo}]`;
  timeDiv.setAttribute("class", "message-timestamp");

  newMsg.appendChild(textDiv);
  newMsg.appendChild(timeDiv);
  newMsg.setAttribute("class", styleClassName);
  if (color !== undefined) {
    newMsg.style.backgroundColor = color;
  }
  chat.appendChild(newMsg);

  // auto-scroll
  chat.scrollTop = newMsg.offsetTop;
}

function chatClientJoined(nick) {
  if (userList === null || userList.find((u) => u === nick) !== undefined) {
    debug(
      "malformed self userList: " +
        JSON.stringify(userList) +
        ", while adding nick: " + nick,
    );
    return;
  }
  userList.push(nick);
  addChatDivElement("message-line-info", `${nick} joined the chat`, true);
}

function chatClientLeft(nick) {
  if (userList === null || userList.find((u) => u === nick) === undefined) {
    debug(
      "malformed self userList: " +
        JSON.stringify(userList) +
        ", while removing nick: " + nick,
    );
    return;
  }
  userList.splice(userList.findIndex((u) => u === nick), 1);
  addChatDivElement("message-line-info", `${nick} left the chat`, true);
}

function chatClientMessage(nick, text, selfNick) {
  const [style, prefix, color] = (() => {
    if (nick === selfNick) {
      return ["message-line-self", "Me", undefined];
    }
    return ["message-line-other", nick, getColorForNickname(nick)];
  })();
  text = `${prefix}: ${text}`;
  addChatDivElement(style, text, color);
}

function chatClientAcceptUserList(list) {
  if (userList !== null) {
    debug("got USERLIST message twice");
    return;
  }
  userList = list;
}

// builtin-commands processing
function tryProcessMessengerCommand(text) {
  switch (text.trim()) {
    case "!list": {
      if (userList === null) {
        debug("did't receive USERLIST message yet");
        return true; // don't send as a message anyway
      }

      const prefix = "Chat: active users";
      const prettyList = userList
        .sort()
        .map((s) => `- ${s}`)
        .join("\n");

      addChatDivElement("message-line-system", `${prefix}\n${prettyList}`);
      return true;
    }
  }
  return false;
}

// websocket operations
function onConnect(nick) {
  const loginInfo = {
    type: "login",
    nick,
  };
  socket.send(JSON.stringify(loginInfo));

  // unblock the callback for the form
  window.chatInputAction = chatInputAction;
}

function onClose() {
  debug("websocket connection closed");
  socket = null;
}

function onMessage(ev, selfNick) {
  const msg = JSON.parse(ev.data);
  if (typeof msg !== "object" || msg === null) {
    debug("malformed data from the server: " + ev.data);
    return;
  }

  switch (msg.type) {
    case "join": {
      if (typeof msg.nick !== "string") {
        debug("malformed JOIN message: " + ev.data);
        return;
      }
      chatClientJoined(msg.nick);
      break;
    }
    case "leave": {
      if (typeof msg.nick !== "string") {
        debug("malformed LEAVE message: " + ev.data);
        return;
      }
      chatClientLeft(msg.nick);
      break;
    }
    case "message": {
      if (
        typeof msg.nick !== "string" ||
        typeof msg.text !== "string"
      ) {
        debug("malformed MESSAGE message: " + ev.data);
        return;
      }
      chatClientMessage(msg.nick, msg.text, selfNick);
      break;
    }
    case "userlist": {
      if (!Array.isArray(msg.list)) {
        debug("malformed USERLIST message: " + ev.data);
        return;
      }
      chatClientAcceptUserList(msg.list);
      break;
    }
    default:
      debug("unsupported message type from the server: " + msg.type);
      return;
  }
}

// onload entrypoint
window.onload = function () {
  // extract self nick from URI params
  const nick = getNickname();

  // connect to the websocket
  const wsUrl = "wss://" + location.host + "/socket";
  socket = new WebSocket(wsUrl);

  // set the callbacks
  socket.onopen = () => onConnect(nick);
  socket.onclose = onClose;
  socket.onmessage = (ev) => onMessage(ev, nick);
};
