/// Main module for launching web endpoint

import { file_server } from "./deps.ts";
import { createMessenger, Messenger } from "./messenger.ts";

import settings from "./settings.json" with { type: "json" };

const mainEndpoint = "https://" + settings.hostname + ":" +
  settings.port.toString();

const httpServerSettings: Deno.ServeOptions | Deno.ServeTlsOptions = {
  hostname: settings.hostname,
  port: settings.port,
  cert: Deno.readTextFileSync(settings.cert),
  key: Deno.readTextFileSync(settings.key),
};

const messenger: Messenger = createMessenger();

function handler(req: Request): Response | Promise<Response> {
  // do basic routing based on url pathname
  const pathname = new URL(req.url).pathname;

  // redirect / -> /static/index.html
  if (pathname === "/") {
    // use generic headers
    const headers = new Headers();
    headers.set("Location", "/static/index.html");

    return new Response("", {
      status: 307,
      headers,
    });
  }

  // serve static files
  if (pathname.startsWith("/static")) {
    return file_server.serveDir(req, {
      fsRoot: "static",
      urlRoot: "static",
    });
  }

  // try to upgrade to websocket
  if (pathname.startsWith("/socket")) {
    if (req.headers.get("upgrade") != "websocket") {
      return new Response(null, { status: 501 });
    }

    if (req.headers.get("origin") != mainEndpoint) {
      return new Response(null, { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    messenger.register(socket);
    return response;
  }

  // respond 404 otherwise
  return new Response("404: Not Found", { status: 404 });
}

Deno.serve(httpServerSettings, handler);
