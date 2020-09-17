import { Room } from "colyseus"
import { Schema, ArraySchema, type } from "@colyseus/schema"
import get from "lodash/get"
import * as Sentry from "@sentry/node"

const MAX_STACK_HEIGHT = 200

// class IP extends Schema {
//   @type("string") address: string;
// }

class Message extends Schema {
  @type("string") msgId: string
  @type("string") uuid: string
  @type("string") name: string
  @type("string") text: string
  @type("string") tint: string
}

class State extends Schema {
  // @type([IP]) blacklist = new ArraySchema<IP>();
  @type([Message]) messages = new ArraySchema<Message>()
}

export class ChatRoom extends Room {
  onCreate(options: any) {
    this.setState(new State())

    console.dir(options)

    this.onMessage("submit", (client, payload) => {
      try {
        if (this.state.messages.length > MAX_STACK_HEIGHT) {
          this.state.messages.splice(0, 1)
        }
        let newMessage = new Message()
        newMessage.msgId = get(payload, "msgId", "No msgId")
        newMessage.text = get(payload, "text", "No text")
        newMessage.name = get(payload, "name", "No name")
        newMessage.uuid = get(payload, "uuid", "No UUID")
        newMessage.tint = get(payload, "tint", "No tint")
        this.state.messages.push(newMessage)
      } catch (err) {
        Sentry.captureException(err)
      }
    })

    this.onMessage("remove", (client, payload) => {
      try {
        let targetMessageIndex = this.state.messages.findIndex(
          (m: Message) => m.msgId == payload.msgId
        )
        this.state.messages.splice(targetMessageIndex, 1)
      } catch (err) {
        Sentry.captureException(err)
      }
    })
  }
}
