import { Room, Client } from "colyseus";
import { Schema, ArraySchema, type } from "@colyseus/schema";
import get from 'lodash/get'


const MAX_STACK_HEIGHT = 10;

// class IP extends Schema {
//   @type("string") address: string;
// }

class Message extends Schema {
  @type("string") msgId: string;
  @type("string") uuid: string;
  @type("string") name: string;
  @type("string") text: string;
  @type("string") tint: string;
}

class State extends Schema {
  // @type([IP]) blacklist = new ArraySchema<IP>();
  @type([Message]) messages = new ArraySchema<Message>();
}

export class ChatRoom extends Room {

  autoDispose = false;

  onCreate(options: any) {

    this.setState(new State());

    this.onMessage("submit", (client, payload) => {
      // console.log('this.state.messages.length', this.state.messages.length)
      // console.dir(this.state.messages)
      // if (this.state.messages.length > MAX_STACK_HEIGHT) this.state.messages.splice(0, 1);
      let newMessage = new Message()
      newMessage.msgId = get(payload, 'msgId', "No msgId")
      newMessage.text = get(payload, 'text', "No text")
      newMessage.name = get(payload, 'name', "No name")
      newMessage.uuid = get(payload, 'uuid', "No UUID")
      newMessage.tint = get(payload, 'tint', "No tint")
      this.state.messages.push(newMessage);
    });

  }

  //   onJoin(client: Client, options: any) {
  //     console.log('CHAT')
  //  }

  // onLeave(client: Client, consented: boolean) {
  //   // delete this.state.players[client.sessionId];
  // }

  // onDispose() {
  // }

}
