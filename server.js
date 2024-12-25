const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const handleSocketConnection = require("./socketHandlers");

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

handleSocketConnection(io);

httpServer.listen(8000, () => console.log("Server running on http://localhost:8000"));
