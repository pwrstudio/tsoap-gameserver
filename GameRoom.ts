import { Room, Client } from "colyseus";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import EasyStar from 'easystarjs'
import crypto from 'crypto'
import querystring from 'querystring'
import fs from 'fs';
import get from 'lodash/get'
import inRange from 'lodash/inRange'
import clamp from 'lodash/clamp'
import isNumber from 'lodash/isNumber'
import * as Sentry from '@sentry/node';

const SSO_SECRET = "daymoon";
const MAX_STACK_HEIGHT = 200;
const MAX_USERNAME_LENGTH = 100;
const MAX_CHATMESSAGE_LENGTH = 1000;

const rawdata = fs.readFileSync('hkw-map-color-hard.json');
const mapMatrix = JSON.parse(rawdata.toString()).data;


// const smallMatrix = []

// for(let row = 0; row < mapMatrix.length; row += 5) {
//     // console.log(row)
//     let temp = []
//     for(let col = 0; col < mapMatrix[row].length; col += 5) {
//         temp.push(mapMatrix[row][col])
//     }
//     smallMatrix.push(temp)
// }

// console.dir(smallMatrix)

// console.log(smallMatrix.length)

// TILE TYPES =>
// 0 = white
// 1 = black
// 2 = yellow
// 3 = red
// 4 = green
// 5 = blue

const easystar = new EasyStar.js();
easystar.setGrid(mapMatrix)
// easystar.setGrid(smallMatrix)
easystar.setAcceptableTiles([0, 2, 3, 4, 5]);

class IP extends Schema {
    @type("string") address: string;
}

class Waypoint extends Schema {
    @type("number") x: number;
    @type("number") y: number;
    @type("number") steps: number;
    @type("string") direction: string;

    constructor (x:number, y:number, direction?:string, steps?:number) {
        super({});

        this.x = x
        this.y = y
        this.direction = direction
        this.steps = steps
    }
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
    @type(Path) fullPath: Path = new Path();
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
                Sentry.captureException(err);
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
                Sentry.captureException(err);
            }
        });

        this.onMessage("go", (client, message) => {
            try {
                let roundedX = clamp(Math.ceil(get(message, 'x', 0) / 10) * 10, 0, 4990)
                let roundedY = clamp(Math.ceil(get(message, 'y', 0) / 10) * 10, 0, 4990)

                // console.log('Y', roundedY)
                // console.log('X', roundedX)
                // console.log('- - - - - ')

                let loResRoundedY = roundedY / 10
                let loResRoundedX = roundedX / 10

                // if (mapMatrix[loResRoundedX][loResRoundedY] !== 1) {

                    easystar.findPath(this.state.players[client.sessionId].x / 10,
                        this.state.players[client.sessionId].y / 10,
                        loResRoundedX,
                        loResRoundedY, path => {
                            if (path === null) {
                                console.error('no path')
                                client.send('illegalMove', {})
                            } else {
                                // console.dir(path)

                                let fullPath = new Path()
                                path.forEach(wp => {
                                    fullPath.waypoints.push(new Waypoint(wp.x * 10, wp.y * 10, '', 10))
                                })
                                // console.dir(fullPath)

                                const SIMPLIFICATION_FACTOR = 1
                                let finalPath = new Path();

                                // console.log('PLAYER X:', this.state.players[client.sessionId].x)
                                // console.log('PLAYER Y:', this.state.players[client.sessionId].y)
                                // console.log('FIRST PATH X:', fullPath.waypoints[0].x)
                                // console.log('FIRST PATH Y:', fullPath.waypoints[0].y)

                                const processPath = (index = 0) => {
                                    const nextIndex = index + SIMPLIFICATION_FACTOR >= (fullPath.waypoints.length - 1) 
                                                        ? fullPath.waypoints.length - 1 
                                                        : index + SIMPLIFICATION_FACTOR
                                    const prevIndex = index == 0 
                                                        ? 0 
                                                        : index - SIMPLIFICATION_FACTOR
                                    // console.log('length', fullPath.waypoints.length - 1)
                                    // console.log('index', index)
                                    // console.log('next index', nextIndex)
                                    // console.log('prev index', prevIndex)
                                    // console.log('=======')

                                    let currentWaypoint = new Waypoint(fullPath.waypoints[index].x, fullPath.waypoints[index].y);

                                    // CALCULATE DIRECTION
                                    let delta_x = fullPath.waypoints[prevIndex].x - currentWaypoint.x;
                                    let delta_y = currentWaypoint.y - fullPath.waypoints[prevIndex].y;
                                    let theta_degrees = Math.atan2(delta_y, delta_x) * (180 / Math.PI);
                                    // console.log(theta_degrees)
                                    // DIRECTIONS =>
                                    // -90 === Back
                                    //  90 === Front
                                    // 180 === Rights
                                    //   0 === Left
                                    if (inRange(theta_degrees, -80, -181)) {
                                        currentWaypoint.direction = 'back';
                                    } else if (inRange(theta_degrees, 10, 170)) {
                                        currentWaypoint.direction = 'front';
                                    } else if (inRange(theta_degrees, 170, 190)) {
                                        currentWaypoint.direction = 'right';
                                    } else if (inRange(theta_degrees, -10, 10)) {
                                        currentWaypoint.direction = 'left';
                                    }

                                    // RECTIFY & CALCULATE STEPS
                                    if (currentWaypoint.direction == "back" || currentWaypoint.direction == "front") {
                                        // console.log('rectify X')
                                        // if(nextIndex !== (fullPath.waypoints.length - 1)) {
                                        //     fullPath.waypoints[nextIndex].x = currentWaypoint.x;                                            
                                        // } else {
                                        //     console.log('§§§§§ FINAL ITERATION')
                                        //     console.log(nextIndex)
                                        // }
                                        currentWaypoint.steps = Math.abs(currentWaypoint.y - fullPath.waypoints[prevIndex].y)
                                    } else if (currentWaypoint.direction == "left" || currentWaypoint.direction == "right") {
                                        // console.log('rectify Y')
                                        // if(nextIndex !== (fullPath.waypoints.length - 1)) {
                                        //     fullPath.waypoints[nextIndex].y = currentWaypoint.y;
                                        // } else {
                                        //     console.log('§§§§§ FINAL ITERATION')
                                        //     console.log(nextIndex)
                                        // }
                                        currentWaypoint.steps = Math.abs(currentWaypoint.x - fullPath.waypoints[prevIndex].x)
                                    }

                                    // !!!! TODO calculate current AREA
                                    // console.log("=> ADDING WAYPOINT:", index);
                                    // console.log("–– X:", currentWaypoint.x);
                                    // console.log("–– Y:", currentWaypoint.y);
                                    // console.log("–– Direction:", currentWaypoint.direction);
                                    // console.log("–– Steps:", currentWaypoint.steps);
                                    // console.log("= = = = =");
                                    finalPath.waypoints.push(currentWaypoint);

                                    if (index == (fullPath.waypoints.length - 1)) {
                                        let extendedPath = new Path()
                                        for(let i = 0; i < finalPath.waypoints.length - 1; i++) {
                                            extendedPath.waypoints.push(finalPath.waypoints[i])
                                            for(let x = 1; x < 5; x++) {
                                                let tempPoint = new Waypoint(finalPath.waypoints[i].x, finalPath.waypoints[i].y, finalPath.waypoints[i + 1].direction, finalPath.waypoints[i + 1].steps)
                                                if(finalPath.waypoints[i + 1].direction == 'back') {
                                                    tempPoint.y =  tempPoint.y - (2 * x)
                                                } else if(finalPath.waypoints[i + 1].direction == 'front') {
                                                    tempPoint.y =  tempPoint.y + (2 * x)
                                                } else if(finalPath.waypoints[i + 1].direction == 'right') {
                                                    tempPoint.x =  tempPoint.x + (2 * x)
                                                } else if(finalPath.waypoints[i + 1].direction == 'left') {
                                                    tempPoint.x =  tempPoint.x - (2 * x)
                                                }                                                
                                                extendedPath.waypoints.push(tempPoint)
                                            }
                                        }

                                        console.dir(extendedPath.waypoints.length)

                                        this.state.players[client.sessionId].x = currentWaypoint.x;
                                        this.state.players[client.sessionId].y = currentWaypoint.y;
                                        this.state.players[client.sessionId].path = extendedPath;
                                        this.state.players[client.sessionId].fullPath = extendedPath;
                                        return
                                    } else {
                                        // let midPoint = new Waypoint(currentWaypoint.x, currentWaypoint.y, currentWaypoint.direction, currentWaypoint.steps)
                                        // if(fullPath.waypoints[nextIndex].direction == 'back') {
                                        //     midPoint.y -= 5
                                        // } else if(fullPath.waypoints[nextIndex].direction == 'front') {
                                        //     midPoint.y += 5
                                        // } else if(fullPath.waypoints[nextIndex].direction == 'right') {
                                        //     midPoint.x += 5
                                        // } else if(fullPath.waypoints[nextIndex].direction == 'left') {
                                        //     midPoint.y -= 5
                                        // }
                                        // finalPath.waypoints.push(midPoint);
                                        processPath(nextIndex)
                                    }
                                }
                                
                                if (fullPath.waypoints.length > 0) {
                                    processPath(SIMPLIFICATION_FACTOR)
                                    // processFullPath(1)
                                } else {
                                    client.send('illegalMove', {})
                                }
                            }
                        });
    
                    easystar.calculate();

                // } else {
                //     console.log('====> Target area:', mapMatrix[loResRoundedX][loResRoundedY])
                //     // TODO: find closes allowed position
                //     client.send('illegalMove', {})
                // }
            } catch (err) {
                console.log(err)
                Sentry.captureException(err);
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
                Sentry.captureException(err);
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
                Sentry.captureException(err);
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
                Sentry.captureException(err);
            }
        }
    }

    async onLeave(client: Client, consented: boolean) {
        console.log('LEFT')
        delete this.state.players[client.sessionId];
    }

    onDispose() {
        console.log('game room disposed')
    }

}

