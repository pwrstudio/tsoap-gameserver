import { Room, Client } from "colyseus.js";
import { v4 as uuidv4 } from "uuid";

import { uniqueNamesGenerator, Config, adjectives, colors, names, animals } from 'unique-names-generator';

export function requestJoinOptions(this: Client, i: number) {
    return {
        requestNumber: i
    };
}

export function onJoin(this: Room) {
    console.log(this.sessionId, "joined.");

    const randomName: string = uniqueNamesGenerator({
        separator: ' ',
        length: 2,
        style: 'capital',
        dictionaries: [adjectives, colors, names, animals]
    });

    setInterval(() => {
        if (Math.floor(Math.random() * (20 - 1 + 1)) + 1 == 5) {
            console.log("** MSG:", this.sessionId,);
            const message: string = uniqueNamesGenerator({
                separator: ' ',
                length: 3,
                dictionaries: [adjectives, colors, animals]
            });
            this.send("submit", {
                uuid: uuidv4(),
                name: randomName,
                text: message
            });
        }
    }, 1000);

    this.onMessage("*", (type, message) => {
        // console.log(this.sessionId, "received:", type, message);
    });
}

export function onLeave(this: Room) {
    console.log(this.sessionId, "left.");
}

export function onError(this: Room, err: any) {
    console.log(this.sessionId, "!! ERROR !!", err.message);
}

export function onStateChange(this: Room, state: any) {
    // console.log("new state", Date.now());
}
