const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const peers = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function peerId(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sv").replace(/[^a-z0-9]/g, "");
}

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const allowedFiles = new Map([["/", "index.html"], ["/index.html", "index.html"], ["/message.html", "message.html"]]);
  const fileName = allowedFiles.get(pathname);
  if (request.method !== "GET" || !fileName) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filePath = path.join(root, fileName);
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(contents);
  });
});

const sockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  let originMatches = false;
  try {
    const origin = new URL(request.headers.origin);
    originMatches = ["http:", "https:"].includes(origin.protocol) && origin.host === request.headers.host;
  } catch {
    originMatches = false;
  }
  if (requestUrl.pathname !== "/signal" || !originMatches) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(request, socket, head, client => sockets.emit("connection", client));
});

sockets.on("connection", client => {
  let identity = null;
  client.on("message", data => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      client.send(JSON.stringify({ type: "error", message: "Ogiltigt signalmeddelande." }));
      return;
    }

    if (message.type === "register") {
      const name = typeof message.name === "string" ? message.name.trim().slice(0, 40) : "";
      const id = peerId(name);
      if (!id) {
        client.send(JSON.stringify({ type: "error", message: "Ange ett giltigt profilnamn för samtal." }));
        return;
      }
      const existing = peers.get(id);
      if (existing && existing !== client && existing.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "error", message: "En annan användare är redan ansluten med det här namnet." }));
        return;
      }
      identity = { id, name };
      peers.set(id, client);
      client.send(JSON.stringify({ type: "registered", id, name }));
      return;
    }

    if (!identity) {
      client.send(JSON.stringify({ type: "error", message: "Anslutningen är inte registrerad." }));
      return;
    }
    if (!["call", "accept", "reject", "offer", "answer", "ice", "end"].includes(message.type) ||
        typeof message.to !== "string" || typeof message.callId !== "string" ||
        message.callId.length > 100 || message.to === identity.id) {
      client.send(JSON.stringify({ type: "error", message: "Ogiltigt samtalsmeddelande." }));
      return;
    }

    const recipient = peers.get(message.to);
    if (!recipient || recipient.readyState !== WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "unavailable", callId: message.callId, to: message.to }));
      return;
    }
    const forwarded = {
      type: message.type,
      from: identity.id,
      fromName: identity.name,
      callId: message.callId
    };
    if (message.description && ["offer", "answer"].includes(message.type)) forwarded.description = message.description;
    if (message.candidate && message.type === "ice") forwarded.candidate = message.candidate;
    recipient.send(JSON.stringify(forwarded));
  });

  client.on("close", () => {
    if (identity && peers.get(identity.id) === client) peers.delete(identity.id);
  });
  client.on("error", error => console.error("WebSocket-fel:", error.message));
});

server.listen(port, () => console.log(`MaxChat körs på http://localhost:${port}`));
