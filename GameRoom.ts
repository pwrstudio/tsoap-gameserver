import { Room, Client } from "colyseus"
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema"
import EasyStar from "easystarjs"
import crypto from "crypto"
import querystring from "querystring"
import fs from "fs"
import get from "lodash/get"
import sample from "lodash/sample"
import clamp from "lodash/clamp"
import isNumber from "lodash/isNumber"
import * as Sentry from "@sentry/node"
import { colors } from "unique-names-generator"
import mongoose from "mongoose"
import { v4 as uuidv4 } from "uuid"
import sanity from "@sanity/client"

const client = sanity({
  projectId: "bu5rnal5",
  dataset: "production",
  useCdn: false,
})

const SSO_SECRET = process.env.SSO_SECRET || ""
const MAX_STACK_HEIGHT = 200
const MAX_USERNAME_LENGTH = 100
const MAX_CHATMESSAGE_LENGTH = 1000
const MONGODB_URI = "mongodb://localhost:27017/details"
const RANDOM_WORDS = [...colors]

const rawdata = fs.readFileSync("grid.json")
const mapMatrix = JSON.parse(rawdata.toString()).data

console.log(SSO_SECRET)
// mongoose.connect(MONGODB_URI, {
//   useUnifiedTopology: true,
//   useNewUrlParser: true,
// })

// const connection = mongoose.connection
// const MongoSchema = mongoose.Schema
// const message = new MongoSchema(
//   {
//     text: {
//       type: String,
//     },
//     uuid: {
//       type: String,
//     },
//     name: {
//       type: String,
//     },
//     msgId: {
//       type: String,
//     },
//     tint: {
//       type: String,
//     },
//     timestamp: {
//       type: Number,
//     },
//     area: {
//       type: Number,
//     },
//   },
//   { collection: "Messages" }
// )

// const MongoMessage = mongoose.model("Message", message)

// connection.once("open", () => {
//   console.log("MongoDB database connection established successfully")
// })

// TILE TYPES =>
// 0 = white
// 1 = black
// 2 = yellow
// 3 = red
// 4 = green
// 5 = blue

const easystar = new EasyStar.js()
easystar.setGrid(mapMatrix)
easystar.setAcceptableTiles([0, 2, 3, 4, 5])
easystar.setTurnPenalty(2)
easystar.setHeuristicsFactor(3)

class IP extends Schema {
  @type("string") address: string
}

class Waypoint extends Schema {
  @type("number") x: number
  @type("number") y: number
  @type("number") area: number
  @type("string") direction: string

  constructor(x: number, y: number, area?: number, direction?: string) {
    super({})

    this.x = x
    this.y = y
    this.area = area
    this.direction = direction
  }
}

class Path extends Schema {
  @type([Waypoint]) waypoints = new ArraySchema<Waypoint>()
}

class Player extends Schema {
  @type("boolean") moderator: boolean
  @type("boolean") npc: boolean
  @type("string") uuid: string
  @type("string") name: string
  @type("string") tint: string
  @type("string") ip: string
  @type("string") avatar: string
  @type("boolean") connected: boolean
  @type("number") x: number
  @type("number") y: number
  @type("number") area: number
  @type("boolean") authenticated: boolean
  @type("string") carrying: string
  @type(Path) path: Path = new Path()
  @type(Path) fullPath: Path = new Path()
}

class CaseStudy extends Schema {
  @type("string") uuid: string
  @type("string") caseStudyId: string
  @type("string") name: string
  @type("number") tint: number
  @type("number") age: number
  @type("number") x: number
  @type("number") y: number
  @type("string") carriedBy: string
}

class Message extends Schema {
  @type("string") msgId: string
  @type("string") uuid: string
  @type("string") name: string
  @type("string") text: string
  @type("string") tint: string
  @type("number") timestamp: number
  @type("number") area: number
}

class State extends Schema {
  @type([IP]) blacklist = new ArraySchema<IP>()
  @type({ map: Player }) players = new MapSchema()
  @type({ map: CaseStudy }) caseStudies = new MapSchema()
  @type([Message]) messages = new ArraySchema<Message>()
}

const calculateDirection = (diffX: Number, diffY: Number) => {
  if (diffX === 0 && diffY === -10) return "front"
  else if (diffX === 10 && diffY === 0) return "right"
  else if (diffX === 0 && diffY === 10) return "back"
  else if (diffX === -10 && diffY === 0) return "left"
  else if (diffX === 0 && diffY === 0) return "rest"
  throw new Error("These differences are not valid: " + diffX + ", " + diffY)
}

const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) +
  Math.ceil(min)

export class GameRoom extends Room {
  autoDispose = false

  maxClients = 500

  onCreate(options: any) {
    this.setState(new State())

    client
      .fetch('*[_type == "caseStudyEmergent"]{title, _id}')
      .then((posts) => {
        console.dir(posts)
        // Place case studies
        const createCaseStudy = () => {
          console.log("–– CREATING ONE CASE STUDY")
          let id = uuidv4()
          let randomCaseStudy = sample(posts)
          this.state.caseStudies[id] = new CaseStudy()
          this.state.caseStudies[id].uuid = id
          this.state.caseStudies[id].name = randomCaseStudy.title
          this.state.caseStudies[id].caseStudyId = randomCaseStudy._id
          this.state.caseStudies[id].age = 10
          this.state.caseStudies[id].carriedBy = ""
          this.state.caseStudies[id].tint = (Math.random() * 0xffffff) << 0
          this.state.caseStudies[id].x =
            Math.ceil(
              (Math.floor(Math.random() * (2500 - 1500 + 1)) + 1500) / 10
            ) * 10
          this.state.caseStudies[id].y =
            Math.ceil(
              (Math.floor(Math.random() * (2200 - 1600 + 1)) + 1500) / 10
            ) * 10
        }

        for (let i = 0; i < 50; i++) {
          createCaseStudy()
        }

        // Drop every minute
        setInterval(createCaseStudy, 20000)
      })

    this.onMessage("blacklist", (client, payload) => {
      try {
        if (
          !this.state.blacklist.find((ip: IP) => ip.address == payload.address)
        ) {
          let newIP = new IP()
          newIP.address = payload.address
          this.state.blacklist.push(newIP)
          for (let key in this.state.players) {
            if (this.state.players[key].ip == newIP.address) {
              let bannedClient = this.clients.find((c: Client) => c.id === key)
              if (bannedClient) {
                console.log("BANNED:", bannedClient.id)
                bannedClient.send("banned")
                bannedClient.leave()
              }
              delete this.state.players[key]
            }
          }
        }
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })

    this.onMessage("whitelist", (client, payload) => {
      try {
        let newIP = new IP()
        newIP.address = payload.address
        const itemIndex = this.state.blacklist.findIndex(
          (ip: IP) => ip === newIP
        )
        this.state.blacklist.splice(itemIndex, 1)
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })

    this.onMessage("go", (client, message) => {
      console.log("X", message.x)
      console.log("Y", message.y)
      try {
        let roundedX = clamp(
          Math.ceil(
            get(message, "x", this.state.players[client.sessionId].x) / 10
          ) * 10,
          0,
          4990
        )
        let roundedY = clamp(
          Math.ceil(
            get(message, "y", this.state.players[client.sessionId].y) / 10
          ) * 10,
          0,
          4990
        )
        let loResRoundedX = roundedX / 10
        let loResRoundedY = roundedY / 10

        let originX = clamp(
          Math.ceil(
            get(message, "originX", this.state.players[client.sessionId].x) / 10
          ) * 10,
          0,
          4990
        )
        let originY = clamp(
          Math.ceil(
            get(message, "originY", this.state.players[client.sessionId].y) / 10
          ) * 10,
          0,
          4990
        )
        let loResOriginX = originX / 10
        let loResOriginY = originY / 10

        // let dx = Math.abs(loResOriginX - loResRoundedX)
        // let dy = Math.abs(loResOriginY - loResRoundedY)
        // let distance = dx + dy
        // if (distance > 150) {
        //   console.error("distance too long")
        //   client.send("illegalMove", {})
        //   return
        // }

        console.time("pathfinding")
        easystar.findPath(
          loResOriginX,
          loResOriginY,
          loResRoundedX,
          loResRoundedY,
          (path) => {
            console.timeEnd("pathfinding")

            if (path === null || path.length == 0) {
              console.error("no path")
              client.send("illegalMove", "No path found")
            } else {
              console.time("path-processing")

              let fullPath = new Path()
              path.forEach((wp) => {
                fullPath.waypoints.push(
                  new Waypoint(wp.x * 10, wp.y * 10, mapMatrix[wp.y][wp.x])
                )
              })

              const SIMPLIFICATION_FACTOR = 1
              let finalPath = new Path()

              const processPath = (index = 0) => {
                const nextIndex =
                  index + SIMPLIFICATION_FACTOR >= fullPath.waypoints.length - 1
                    ? fullPath.waypoints.length - 1
                    : index + SIMPLIFICATION_FACTOR
                const prevIndex = index == 0 ? 0 : index - SIMPLIFICATION_FACTOR

                let currentWaypoint = new Waypoint(
                  fullPath.waypoints[index].x,
                  fullPath.waypoints[index].y,
                  fullPath.waypoints[index].area
                )

                const delta_x =
                  currentWaypoint.x - fullPath.waypoints[prevIndex].x
                const delta_y =
                  fullPath.waypoints[prevIndex].y - currentWaypoint.y
                currentWaypoint.direction = calculateDirection(delta_x, delta_y)

                finalPath.waypoints.push(currentWaypoint)

                if (index == fullPath.waypoints.length - 1) {
                  let extendedPath = new Path()
                  for (let i = 0; i < finalPath.waypoints.length - 1; i++) {
                    extendedPath.waypoints.push(finalPath.waypoints[i])
                    for (let x = 1; x < 5; x++) {
                      let tempPoint = new Waypoint(
                        finalPath.waypoints[i].x,
                        finalPath.waypoints[i].y,
                        finalPath.waypoints[i].area,
                        finalPath.waypoints[i + 1].direction
                      )
                      if (finalPath.waypoints[i + 1].direction == "back") {
                        tempPoint.y = tempPoint.y - 2 * x
                      } else if (
                        finalPath.waypoints[i + 1].direction == "front"
                      ) {
                        tempPoint.y = tempPoint.y + 2 * x
                      } else if (
                        finalPath.waypoints[i + 1].direction == "right"
                      ) {
                        tempPoint.x = tempPoint.x + 2 * x
                      } else if (
                        finalPath.waypoints[i + 1].direction == "left"
                      ) {
                        tempPoint.x = tempPoint.x - 2 * x
                      }
                      extendedPath.waypoints.push(tempPoint)
                    }
                  }

                  console.timeEnd("path-processing")
                  this.state.players[client.sessionId].x = currentWaypoint.x
                  this.state.players[client.sessionId].y = currentWaypoint.y
                  this.state.players[client.sessionId].path = extendedPath
                  this.state.players[client.sessionId].fullPath = fullPath

                  return
                } else {
                  processPath(nextIndex)
                }
              }

              if (fullPath.waypoints.length > 0) {
                processPath(0)
                // processFullPath(1)
              } else {
                client.send("illegalMove", "Empty full path")
              }
            }
          }
        )

        easystar.calculate()
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })

    this.onMessage("teleport", (client, message) => {
      console.dir(message)

      if (message.area) {
        let newX = 0
        let newY = 0

        let colorIndex = 0
        if (message.area == "green") colorIndex = 4
        else if (message.area == "blue") colorIndex = 5
        else if (message.area == "yellow") colorIndex = 2
        else if (message.area == "red") colorIndex = 3

        console.log(colorIndex)

        while (true) {
          newX =
            Math.ceil((Math.floor(Math.random() * (3950 - 50 + 1)) + 50) / 10) *
            10
          newY =
            Math.ceil((Math.floor(Math.random() * (3950 - 50 + 1)) + 50) / 10) *
            10
          if (mapMatrix[newY / 10][newX / 10] == colorIndex) break
        }

        console.log("TELEPORT")
        console.log("area", mapMatrix[newY / 10][newX / 10])
        console.log("=> Y", newY)
        console.log("=> X", newX)
        console.log("- - - - - ")

        this.state.players[client.sessionId].area = colorIndex
        this.state.players[client.sessionId].path = new Path()
        this.state.players[client.sessionId].fullPath = new Path()
        this.state.players[client.sessionId].x = newX
        this.state.players[client.sessionId].y = newY
      }
    })

    this.onMessage("submitChatMessage", (client, payload) => {
      try {
        if (payload.text && payload.text.length > 0) {
          if (this.state.messages.length > MAX_STACK_HEIGHT) {
            this.state.messages.splice(0, 1)
          }
          let newMessage = new Message()
          newMessage.msgId = get(payload, "msgId", "No msgId")
          newMessage.text = payload.text.substring(0, MAX_CHATMESSAGE_LENGTH)
          newMessage.name = get(payload, "name", "No name")
          newMessage.uuid = get(payload, "uuid", "No UUID")
          newMessage.tint = get(payload, "tint", "No tint")
          newMessage.area = get(payload, "area", 4)
          newMessage.timestamp = Date.now()
          this.state.messages.push(newMessage)
          // Write to DB
          // let messageToMongo = new MongoMessage(newMessage)
          // messageToMongo.save((err) => {
          //   if (err) {
          //     console.error(err)
          //   }
          // })
        }
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })

    this.onMessage("removeChatMessage", (client, payload) => {
      try {
        let targetMessageIndex = this.state.messages.findIndex(
          (m: Message) => m.msgId == payload.msgId
        )
        if (isNumber(targetMessageIndex)) {
          this.state.messages.splice(targetMessageIndex, 1)
        }
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })

    this.onMessage("pickUpCaseStudy", (client, payload) => {
      try {
        console.log("AGE", this.state.caseStudies[payload.uuid].age)
        this.state.caseStudies[payload.uuid].carriedBy = client.sessionId
        this.state.caseStudies[payload.uuid].age -= 1
        this.state.players[client.sessionId].carrying = payload.uuid
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })

    this.onMessage("dropCaseStudy", (client, payload) => {
      try {
        console.dir(payload.uuid)
        console.dir(client.sessionId)
        this.state.players[client.sessionId].carrying = ""
        if (this.state.caseStudies[payload.uuid].age == 0) {
          delete this.state.caseStudies[payload.uuid]
        } else {
          this.state.caseStudies[payload.uuid].x =
            this.state.players[client.sessionId].x + getRandomInt(-40, 40)
          this.state.caseStudies[payload.uuid].y =
            this.state.players[client.sessionId].y + getRandomInt(-40, 40)
          this.state.caseStudies[payload.uuid].carriedBy = ""
        }
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    })
  }

  onAuth(client: Client, options: any, request: any) {
    if (
      !this.state.blacklist.find(
        (ip: IP) => ip.address == request.connection.remoteAddress
      )
    ) {
      console.dir(options)

      options.ip = get(request, "connection.remoteAddress", "6.6.6.6")

      if (options.sso && options.sig) {
        console.log("Authenticate accredited user")
        const hmac = crypto.createHmac("sha256", SSO_SECRET)
        const decoded_sso = decodeURIComponent(options.sso)
        hmac.update(decoded_sso)
        const hash = hmac.digest("hex")
        if (options.sig == hash) {
          const b = Buffer.from(options.sso, "base64")
          const inner_qstring = b.toString("utf8")
          const ret = querystring.parse(inner_qstring)
          console.dir(ret)
          // options.uuid = ret.username
          options.name = ret.name || ret.username
          delete options.sso
          delete options.sig
          options.authenticated = true
          return true
        }
        return false
      } else {
        return true
      }
    } else {
      console.log("BANNED")
      return false
    }
  }

  onJoin(client: Client, options: any) {
    console.dir(options)

    if (!options.moderator) {
      try {
        let startX = 0
        let startY = 0

        while (true) {
          startX =
            Math.ceil((Math.floor(Math.random() * (3950 - 50 + 1)) + 50) / 10) *
            10
          startY =
            Math.ceil((Math.floor(Math.random() * (3950 - 50 + 1)) + 50) / 10) *
            10
          // Spawn all in green area
          if (mapMatrix[startY / 10][startX / 10] == 4) break
        }

        let randomAdjective = sample(RANDOM_WORDS)
        randomAdjective =
          randomAdjective.charAt(0).toUpperCase() + randomAdjective.slice(1)
        const userName =
          (!get(options, "authenticated", false) ? randomAdjective + " " : "") +
          get(options, "name", "Undefined name").substring(
            0,
            MAX_USERNAME_LENGTH
          )

        this.state.players[client.sessionId] = new Player()
        this.state.players[client.sessionId].authenticated =
          options.authenticated || false
        this.state.players[client.sessionId].npc = options.npc || false
        this.state.players[client.sessionId].tint = get(
          options,
          "tint",
          "0XFF0000"
        )
        this.state.players[client.sessionId].name = userName
        this.state.players[client.sessionId].uuid = get(
          options,
          "uuid",
          "no-uuid"
        )
        this.state.players[client.sessionId].ip = get(options, "ip", "6.6.6.6")
        this.state.players[client.sessionId].avatar = get(
          options,
          "avatar",
          "Undefined avatar id"
        )
        this.state.players[client.sessionId].connected = true
        this.state.players[client.sessionId].x = startX
        this.state.players[client.sessionId].y = startY
        this.state.players[client.sessionId].area =
          mapMatrix[startY / 10][startX / 10]
      } catch (err) {
        console.log(err)
        Sentry.captureException(err)
      }
    }
  }

  async onLeave(client: Client, consented: boolean) {
    console.log("LEFT")
    delete this.state.players[client.sessionId]
  }

  onDispose() {
    console.log("game room disposed")
  }
}
