import http from "http"
import express from "express"
import cors from "cors"
import { Server } from "colyseus"
import { monitor } from "@colyseus/monitor"
// import * as Sentry from '@sentry/node';

// Sentry.init({ dsn: 'https://7cb5d18a944d4a0cb8a9c4ddd6fa1d9d@o433904.ingest.sentry.io/5390092' });

import { GameRoom } from "./GameRoom"
import { ChatRoom } from "./ChatRoom"

const port = Number(process.env.PORT || 2567)
const app = express()

app.use(cors())
app.use(express.json())

const server = http.createServer(app)
const gameServer = new Server({
  server,
})

// register your room handlers
gameServer.define("game", GameRoom)
gameServer.define("chat", ChatRoom)

// register colyseus monitor AFTER registering your room handlers
app.use("/colyseus", monitor())

gameServer.listen(port)
console.log(`Listening on ws://localhost:${port}`)
