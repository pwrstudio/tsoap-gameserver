import { Room, Client } from "colyseus";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import EasyStar from 'easystarjs'
import fs from 'fs';
import get from 'lodash/get'

const rawdata = fs.readFileSync('hkw-map-color-hard.json');
let mapMatrix = JSON.parse(rawdata.toString()).data;

// console.dir(mapMatrix)

// 0 = white
// 1 = black
// 2 = yellow
// 3 = red
// 4 = green
// 5 = blue

let easystar = new EasyStar.js();
easystar.setGrid(mapMatrix)
easystar.setAcceptableTiles([0, 2, 3, 4, 5]);
// easystar.setTileCost(1, 10000);
// easystar.setIterationsPerCalculation(1000);
easystar.enableDiagonals();
easystar.disableCornerCutting()

// var finder = new PF.AStarFinder();

// fs.readFile('hkw-map-array.json', (err, data) => {
//   if (err) throw err;
//   let student = JSON.parse(data);
//   console.log(student);
// });

class Waypoint extends Schema {
  @type("number") x: number;
  @type("number") y: number;
}

class Path extends Schema {
  @type([Waypoint]) waypoints = new ArraySchema<Waypoint>();
}

class Player extends Schema {
  @type("string") uuid: string;
  @type("string") name: string;
  @type("string") tint: string;
  @type("string") ip: string;
  @type("number") avatar: number;
  @type("boolean") connected: boolean;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") area: number;
  @type(Path) path: Path = new Path();
}

class State extends Schema {
  @type({ map: Player }) players = new MapSchema();
}

export class GameRoom extends Room {


  onCreate(options: any) {

    this.setState(new State());

    // Jimp.read('hkw-bit-small.bmp')
    //   .then(map => {
    //     // console.dir(map.bitmap.data)

    //     const mapArray = [...map.bitmap.data]

    //     // let firstDimension = 0
    //     // let secondDimension = 0

    //     let resultArray = []

    //     for (let i = 0; i < 250000; i += 4) {
    //       resultArray.push(mapArray[i] === 255 ? 1 : 0)
    //     }

    //     console.dir(resultArray)

    //   })
    //   .catch(err => {
    //     console.error(err);
    //   });

    // this.onMessage("move", (client, message) => {
    //   // console.log(client.sessionId)
    //   // console.dir(message.direction)
    //   if (message.direction === 'up') {
    //     this.state.players[client.sessionId].y -= 5
    //   } else if (message.direction === 'down') {
    //     this.state.players[client.sessionId].y += 5
    //   } else if (message.direction === 'left') {
    //     this.state.players[client.sessionId].x -= 5
    //   } else if (message.direction === 'right') {
    //     this.state.players[client.sessionId].x += 5
    //   }
    // });

    this.onMessage("go", (client, message) => {
      let roundedX = Math.ceil(get(message, 'x', 0) / 10) * 10
      let roundedY = Math.ceil(get(message, 'y', 0) / 10) * 10

      if (roundedX > 5000) roundedX = 5000
      if (roundedX < 0) roundedX = 0

      if (roundedY > 5000) roundedY = 5000
      if (roundedY < 0) roundedY = 0

      console.log('Y', roundedY)
      console.log('X', roundedX)
      // console.log('[Y][X] => mapMatrix[' + roundedY / 10 + '][' + roundedX / 10 + '] => ' + mapMatrix[roundedY / 10][roundedX / 10])
      console.log('- - - - - ')

      if (mapMatrix[roundedY / 10][roundedX / 10] !== 1) {

        // let grid = new PF.Grid(mapMatrix);

        // console.dir(grid)

        // let path = finder.findPath(this.state.players[client.sessionId].y / 10,
        //   this.state.players[client.sessionId].x / 10,
        //   roundedY / 10,
        //   roundedX / 10,
        //   grid);

        // console.dir(path)
        // grid = new PF.Grid(mapMatrix);
        // let smoothPath = PF.Util.smoothenPath(grid, path);
        // console.dir(smoothPath)
        // this.state.players[client.sessionId].x = roundedX;
        // this.state.players[client.sessionId].y = roundedY;
        // this.state.players[client.sessionId].path = new Path();
        // path.forEach(wp => {
        //   let tempWp = new Waypoint()
        //   /// !!!!!!!!!! TO FIX
        //   tempWp.y = wp[0] * 10
        //   tempWp.x = wp[1] * 10
        //   this.state.players[client.sessionId].path.waypoints.push(tempWp)
        // })


        easystar.findPath(this.state.players[client.sessionId].x / 10,
          this.state.players[client.sessionId].y / 10,
          roundedX / 10,
          roundedY / 10, path => {
            if (path === null) {
              console.error('no path')
            } else {
              // console.dir(path)
              this.state.players[client.sessionId].x = roundedX;
              this.state.players[client.sessionId].y = roundedY;
              this.state.players[client.sessionId].path = new Path();
              path.forEach(wp => {
                let tempWp = new Waypoint()
                tempWp.y = wp.y * 10
                tempWp.x = wp.x * 10
                this.state.players[client.sessionId].path.waypoints.push(tempWp)
              })
              this.state.players[client.sessionId].area = mapMatrix[path[path.length - 1].y][path[path.length - 1].x]
              console.log('AREA:', mapMatrix[path[path.length - 1].y][path[path.length - 1].x])
            }
          });

        easystar.calculate();

      } else {
        // TODO: find closes allowed position 
      }

    });

  }

  onAuth(client: Client, options: any, request: any) {
    return (options.ip = request.connection.remoteAddress);
  }

  onJoin(client: Client, options: any) {
    console.dir(options);

    let startX = 0;
    let startY = 0;

    while (true) {
      startX = Math.ceil((Math.floor(Math.random() * (4950 - 50 + 1)) + 50) / 10) * 10;
      startY = Math.ceil((Math.floor(Math.random() * (4950 - 50 + 1)) + 50) / 10) * 10;
      if (mapMatrix[startY / 10][startX / 10] !== 1) break;
    }

    this.state.players[client.sessionId] = new Player();
    this.state.players[client.sessionId].tint = options.tint;
    this.state.players[client.sessionId].name = options.name;
    this.state.players[client.sessionId].uuid = options.uuid;
    this.state.players[client.sessionId].ip = options.ip;
    this.state.players[client.sessionId].avatar = options.avatar;
    this.state.players[client.sessionId].connected = true;
    this.state.players[client.sessionId].x = startX
    this.state.players[client.sessionId].y = startY
    this.state.players[client.sessionId].area = mapMatrix[startY / 10][startX / 10]
  }

  async onLeave(client: Client, consented: boolean) {
    // // flag client as inactive for other users
    // this.state.players[client.sessionId].connected = false;
    delete this.state.players[client.sessionId];

    // try {
    //   if (consented) {
    //     throw new Error("consented leave");
    //   }

    //   console.log('allow reconnection of:', this.state.players[client.sessionId].name)

    //   // allow disconnected client to reconnect into this room until 20 seconds
    //   await this.allowReconnection(client, 10);

    //   // client returned! let's re-activate it.
    //   this.state.players[client.sessionId].connected = true;

    // } catch (e) {
    //   console.log('time expired for:', this.state.players[client.sessionId].name)
    //   // 20 seconds expired. let's remove the client.
    //   delete this.state.players[client.sessionId];
    // }
  }

  // onDispose() {
  // }

}
