import { Room, Client } from "colyseus";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
// import EasyStar from 'easystarjs'
import crypto from 'crypto'
import querystring from 'querystring'
import fs from 'fs';
import get from 'lodash/get'
import inRange from 'lodash/inRange'
import isNumber from 'lodash/isNumber'
// import * as Sentry from '@sentry/node';
import PF from 'pathfinding';
import { find } from "lodash";

const SSO_SECRET = "daymoon";
const MAX_STACK_HEIGHT = 200;
const MAX_USERNAME_LENGTH = 100;
const MAX_CHATMESSAGE_LENGTH = 1000;

const rawdata = fs.readFileSync('hkw-map-color-hard.json');
const mapMatrix = JSON.parse(rawdata.toString()).data;

const rawdataBit = fs.readFileSync('hkw-map-bit.json');
const bitMatrix = JSON.parse(rawdataBit.toString()).data;


// console.dir(rawdataBit)
// console.log(bitMatrix)
// 0 = white
// 1 = black
// 2 = yellow
// 3 = red
// 4 = green
// 5 = blue

// const easystar = new EasyStar.js();
// easystar.setGrid(mapMatrix)
// easystar.setAcceptableTiles([0, 2, 3, 4, 5]);
// easystar.setIterationsPerCalculation(1000);
// easystar.enableDiagonals();
// easystar.disableCornerCutting()

var grid = new PF.Grid(bitMatrix);

var finder = new PF.AStarFinder({
    heuristic: PF.Heuristic.manhattan,
    weight: 1000,
});

// var finder = new PF.BestFirstFinder();

// console.dir(grid)

console.dir(finder)

class IP extends Schema {
    @type("string") address: string;
}

class Waypoint extends Schema {
    @type("number") x: number;
    @type("number") y: number;
    @type("number") steps: number;
    @type("string") direction: string;
}

class Path extends Schema {
    @type([Waypoint]) waypoints = new ArraySchema<Waypoint>();
}

class Player extends Schema {
    @type("boolean") moderator: boolean;
    @type("string") uuid: string;
    @type("string") name: string;
    @type("string") tint: string;
    @type("string") ip: string;
    @type("number") avatar: number;
    @type("boolean") connected: boolean;
    @type("number") x: number;
    @type("number") y: number;
    @type("number") area: number;
    @type("boolean") authenticated: boolean;
    @type(Path) path: Path = new Path();
}

class Message extends Schema {
    @type("string") msgId: string;
    @type("string") uuid: string;
    @type("string") name: string;
    @type("string") text: string;
    @type("string") tint: string;
    @type("number") timestamp: number;
}

class PrivateRoom extends Schema {
    @type(["string"]) clients = new ArraySchema<"string">();
}

class State extends Schema {
    @type([IP]) blacklist = new ArraySchema<IP>();
    @type({ map: Player }) players = new MapSchema();
    @type([Message]) messages = new ArraySchema<Message>();
    @type({ map: PrivateRoom }) privateRooms = new MapSchema();
}

export class GameRoom extends Room {

    autoDispose = false;

    maxClients = 500;

    onCreate(options: any) {

        this.setState(new State());

        this.onMessage("blacklist", (client, payload) => {
            try {
                if (!this.state.blacklist.find((ip: IP) => ip.address == payload.address)) {
                    let newIP = new IP()
                    newIP.address = payload.address
                    this.state.blacklist.push(newIP);
                    for (let key in this.state.players) {
                        if (this.state.players[key].ip == newIP.address) {
                            let bannedClient = this.clients.find((c: Client) => c.id === key)
                            if (bannedClient) {
                                console.log('BANNED:', bannedClient.id)
                                bannedClient.send("banned");
                                bannedClient.leave()
                            }
                            delete this.state.players[key]
                        }
                    }
                }
            } catch (err) {
                console.log(err)
                // Sentry.captureException(err);
            }
        });

        this.onMessage("whitelist", (client, payload) => {
            try {
                let newIP = new IP()
                newIP.address = payload.address
                const itemIndex = this.state.blacklist.findIndex((ip: IP) => ip === newIP);
                this.state.blacklist.splice(itemIndex, 1);
            } catch (err) {
                console.log(err)

                // Sentry.captureException(err);
            }
        });

        this.onMessage("go", (client, message) => {
            try {
                let roundedX = Math.ceil(get(message, 'x', 0) / 10) * 10
                let roundedY = Math.ceil(get(message, 'y', 0) / 10) * 10

                if (roundedX > 5000) roundedX = 4990
                if (roundedX < 0) roundedX = 0

                if (roundedY > 5000) roundedY = 4990
                if (roundedY < 0) roundedY = 0

                console.log('Y', roundedY)
                console.log('X', roundedX)
                console.log('- - - - - ')

                let loResRoundedY = roundedY / 10
                let loResRoundedX = roundedX / 10

                if (grid.isWalkableAt(loResRoundedX, loResRoundedY)) {

                    // console.log('start X:', this.state.players[client.sessionId].x / 10)
                    // console.log('start Y:', this.state.players[client.sessionId].y / 10)
                    // console.log('end X:', loResRoundedX)
                    // console.log('end Y:', loResRoundedY)

                    let path = finder.findPath(
                        this.state.players[client.sessionId].x / 10,
                        this.state.players[client.sessionId].y / 10,
                        loResRoundedX,
                        loResRoundedY,
                        grid.clone());

                    let pathObj = path.map(wp => {
                        return ({ x: wp[0] * 10, y: wp[1] * 10, steps: 120, direction: '' })
                    })

                    // console.dir(pathObj)


                    const SIMPLIFICATION_FACTOR = 8
                    let finalPath = new Path();

                    console.log('PLAYER X:', this.state.players[client.sessionId].x)
                    console.log('PLAYER Y:', this.state.players[client.sessionId].y)
                    console.log('FIRST PATH X:', pathObj[0].x)
                    console.log('FIRST PATH Y:', pathObj[0].y)

                    const processPath = (index = 0) => {
                        const nextIndex = index + SIMPLIFICATION_FACTOR >= (pathObj.length - 1) ? (pathObj.length - 1) : index + SIMPLIFICATION_FACTOR
                        const prevIndex = index == 0 ? 0 : index - SIMPLIFICATION_FACTOR
                        console.log('length', pathObj.length - 1)
                        console.log('index', index)
                        console.log('next index', nextIndex)
                        console.log('prev index', prevIndex)
                        console.log('=======')

                        let currentWaypoint = new Waypoint();
                        currentWaypoint.x = pathObj[index].x;
                        currentWaypoint.y = pathObj[index].y;

                        // CALCULATE DIRECTION
                        let delta_x = pathObj[prevIndex].x - currentWaypoint.x;
                        let delta_y = currentWaypoint.y - pathObj[prevIndex].y;
                        let theta_degrees = Math.atan2(delta_y, delta_x) * (180 / Math.PI);
                        // console.log("degrees:", theta_degrees);
                        if (inRange(theta_degrees, -20, -181)) {
                            currentWaypoint.direction = 'back';
                        } else if (inRange(theta_degrees, 20, 160)) {
                            currentWaypoint.direction = 'front';
                        } else if (inRange(theta_degrees, 160, 181)) {
                            currentWaypoint.direction = 'right';
                        } else if (inRange(theta_degrees, -20, 20)) {
                            currentWaypoint.direction = 'left';
                        }
                        // console.log("direction:", currentWaypoint.direction);

                        // RECTIFY & CALCULATE STEPS
                        if (currentWaypoint.direction == "back" || currentWaypoint.direction == "front") {
                            // console.log('rectify X')
                            currentWaypoint.steps = Math.abs(currentWaypoint.y - pathObj[prevIndex].y)
                            pathObj[nextIndex].x = currentWaypoint.x;
                        } else if (currentWaypoint.direction == "left" || currentWaypoint.direction == "right") {
                            // console.log('rectify Y')+
                            currentWaypoint.steps = Math.abs(currentWaypoint.x - pathObj[prevIndex].x)
                            pathObj[nextIndex].y = currentWaypoint.y;
                        }

                        // !!!! TODO calculate current AREA

                        console.log("=> ADDING WAYPOINT:", index);
                        console.log("–– X:", currentWaypoint.x);
                        console.log("–– Y:", currentWaypoint.y);
                        console.log("–– Direction:", currentWaypoint.direction);
                        console.log("–– Steps:", currentWaypoint.steps);
                        console.log("= = = = =");
                        finalPath.waypoints.push(currentWaypoint);

                        if (index == (pathObj.length - 1)) {
                            this.state.players[client.sessionId].x = currentWaypoint.x;
                            this.state.players[client.sessionId].y = currentWaypoint.y;
                            this.state.players[client.sessionId].path = finalPath;
                            // console.dir(finalPath.waypoints)
                            // finalPath.waypoints.forEach(p => console.dir(p))
                            return
                        } else {
                            processPath(nextIndex)
                        }

                    }


                    if (pathObj.length > 0) {
                        processPath(SIMPLIFICATION_FACTOR)
                        // let lastWaypoint = path.slice(-1)[0]
                        // this.state.players[client.sessionId].area = mapMatrix[lastWaypoint[1]][lastWaypoint[0]]
                    } else {
                        client.send('illegalMove', {})
                    }


                    // easystar.findPath(this.state.players[client.sessionId].x / 10,
                    //     this.state.players[client.sessionId].y / 10,
                    //     roundedX / 10,
                    //     roundedY / 10, path => {
                    //         if (path === null) {
                    //             console.error('no path')
                    //         } else {
                    //             this.state.players[client.sessionId].x = roundedX;
                    //             this.state.players[client.sessionId].y = roundedY;
                    //             this.state.players[client.sessionId].path = new Path();
                    //             path.forEach(wp => {
                    //                 let tempWp = new Waypoint()
                    //                 tempWp.y = wp.y * 10
                    //                 tempWp.x = wp.x * 10
                    //                 this.state.players[client.sessionId].path.waypoints.push(tempWp)
                    //             })
                    //             let lastWaypoint = path.slice(-1)[0]
                    //             this.state.players[client.sessionId].area = mapMatrix[get(lastWaypoint, 'y', 0)][get(lastWaypoint, 'x', 0)]
                    //         }
                    //     });

                    // easystar.calculate();

                } else {
                    // TODO: find closes allowed position
                    client.send('illegalMove', {})
                }
            } catch (err) {
                console.log(err)

                // Sentry.captureException(err);
            }

        });

        this.onMessage("teleport", (client, message) => {
            console.dir(message)

            if (message.area) {

                let newX = 0
                let newY = 0

                let colorIndex = 0
                if (message.area == 'green')
                    colorIndex = 4
                else if (message.area == 'blue')
                    colorIndex = 5
                else if (message.area == 'yellow')
                    colorIndex = 2
                else if (message.area == 'red')
                    colorIndex = 3

                console.log(colorIndex)

                while (true) {
                    newX = Math.ceil((Math.floor(Math.random() * (4950 - 50 + 1)) + 50) / 10) * 10;
                    newY = Math.ceil((Math.floor(Math.random() * (4950 - 50 + 1)) + 50) / 10) * 10;
                    if (mapMatrix[newY / 10][newX / 10] == colorIndex) break;
                }

                console.log('TELEPORT')
                console.log('area', mapMatrix[newY / 10][newX / 10])
                console.log('=> Y', newY)
                console.log('=> X', newX)
                console.log('- - - - - ')

                this.state.players[client.sessionId].area = colorIndex
                this.state.players[client.sessionId].x = newX
                this.state.players[client.sessionId].y = newY

            }

        })

        this.onMessage("submitChatMessage", (client, payload) => {
            try {
                if (payload.text && payload.text.length > 0) {
                    if (this.state.messages.length > MAX_STACK_HEIGHT) {
                        this.state.messages.splice(0, 1);
                    }
                    let newMessage = new Message()
                    newMessage.msgId = get(payload, 'msgId', "No msgId")
                    newMessage.text = payload.text.substring(0, MAX_CHATMESSAGE_LENGTH);
                    newMessage.name = get(payload, 'name', "No name")
                    newMessage.uuid = get(payload, 'uuid', "No UUID")
                    newMessage.tint = get(payload, 'tint', "No tint")
                    newMessage.timestamp = Date.now();
                    this.state.messages.push(newMessage);
                }
            } catch (err) {
                console.log(err)

                // Sentry.captureException(err);
            }
        });

        this.onMessage("removeChatMessage", (client, payload) => {
            try {
                let targetMessageIndex = this.state.messages.findIndex((m: Message) => m.msgId == payload.msgId)
                if (isNumber(targetMessageIndex)) {
                    this.state.messages.splice(targetMessageIndex, 1);
                }
            } catch (err) {
                console.log(err)
                // Sentry.captureException(err);
            }
        });

        // createPrivateRoom
        this.onMessage("createPrivateRoom", (client, payload) => {
            console.log(payload.roomId)
            this.state.privateRooms[payload.roomId] = new PrivateRoom();
            this.state.privateRooms[payload.roomId].clients.push(client.sessionId)
            this.state.privateRooms[payload.roomId].clients.push(payload.partner)
            console.dir(this.state.privateRooms)
        })

        // leavePrivateRoom
        this.onMessage("leavePrivateRoom", (client, payload) => {
            console.log(payload.roomId)
            delete this.state.privateRooms[payload.roomId]
            console.dir(this.state.privateRooms)
        })

        // joinPrivateRoom


    }

    onAuth(client: Client, options: any, request: any) {
        if (!this.state.blacklist.find((ip: IP) => ip.address == request.connection.remoteAddress)) {
            console.dir(options)

            options.ip = get(request, 'connection.remoteAddress', '6.6.6.6')

            if (options.sso && options.sig) {
                console.log('Authenticate accredited user')
                const hmac = crypto.createHmac('sha256', SSO_SECRET);
                const decoded_sso = decodeURIComponent(options.sso);
                hmac.update(decoded_sso);
                const hash = hmac.digest('hex');
                if (options.sig == hash) {
                    const b = Buffer.from(options.sso, 'base64');
                    const inner_qstring = b.toString('utf8');
                    const ret = querystring.parse(inner_qstring);
                    console.dir(ret)
                    // options.uuid = ret.username
                    options.name = ret.name || ret.username;
                    delete options.sso;
                    delete options.sig;
                    options.authenticated = true
                    return (true);
                }
                return false
            } else {
                return (true);
            }
        } else {
            console.log('BANNED')
            return false
        }
    }

    onJoin(client: Client, options: any) {
        console.dir(options);

        if (!options.moderator) {

            try {

                let startX = 0;
                let startY = 0;

                while (true) {
                    startX = Math.ceil((Math.floor(Math.random() * (4950 - 50 + 1)) + 50) / 10) * 10;
                    startY = Math.ceil((Math.floor(Math.random() * (4950 - 50 + 1)) + 50) / 10) * 10;
                    // Spawn all in green area
                    if (mapMatrix[startY / 10][startX / 10] == 4) break;
                }

                this.state.players[client.sessionId] = new Player();
                this.state.players[client.sessionId].authenticated = options.authenticated || false;
                this.state.players[client.sessionId].tint = get(options, 'tint', '0XFF0000');
                this.state.players[client.sessionId].name = get(options, 'name', 'Undefined name').substring(0, MAX_USERNAME_LENGTH);
                this.state.players[client.sessionId].uuid = get(options, 'uuid', 'no-uuid');
                this.state.players[client.sessionId].ip = get(options, 'ip', '6.6.6.6');
                this.state.players[client.sessionId].avatar = get(options, 'avatar', 1);
                this.state.players[client.sessionId].connected = true;
                this.state.players[client.sessionId].x = startX
                this.state.players[client.sessionId].y = startY
                this.state.players[client.sessionId].area = mapMatrix[startY / 10][startX / 10]

            } catch (err) {
                console.log(err)

                // Sentry.captureException(err);
            }
        }
    }

    async onLeave(client: Client, consented: boolean) {
        console.log('LEFT')
        delete this.state.players[client.sessionId];

        // try {
        //     console.log('Left:', this.state.players[client.sessionId].name)
        // } catch (err) {
        //     Sentry.captureException(err);
        // }
    }

    onDispose() {
        console.log('game room disposed')
    }

}

