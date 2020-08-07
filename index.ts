import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import * as Sentry from '@sentry/node';
// import socialRoutes from "@colyseus/social/express"

Sentry.init({ dsn: 'https://53649fd6370545159443264caa8cc0ff@o65254.ingest.sentry.io/5377429' });

import { GameRoom } from "./GameRoom";
import { ChatRoom } from "./ChatRoom";

const port = Number(process.env.PORT || 2567);
const app = express()

app.use(cors());
app.use(express.json())

const server = http.createServer(app);
const gameServer = new Server({
  server,
  pingMaxRetries: 10
});

// register your room handlers
gameServer.define('game', GameRoom);
gameServer.define('chat', ChatRoom);

/**
 * Register @colyseus/social routes
 *
 * - uncomment if you want to use default authentication (https://docs.colyseus.io/authentication/)
 * - also uncomment the import statement
 */
// app.use("/", socialRoutes);

// register colyseus monitor AFTER registering your room handlers
app.use("/colyseus", monitor());

gameServer.listen(port);
console.log(`Listening on ws://localhost:${port}`)
