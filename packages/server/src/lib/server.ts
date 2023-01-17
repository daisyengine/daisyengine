import {
  ClientProtocol,
  NumberRef,
  ServerProtocol,
} from '@daisy-engine/common';
import { NetworkClient } from './NetworkClient';
import { ClientStatus } from './ClientStatus';
import { Room } from './Room';
import { WebSocketServer } from './WebsocketServer';

interface RoomDefinition {
  template: typeof Room;
  opts?: any;
}

const PACKET_PING = Buffer.from([ServerProtocol.Ping]);

export class Server {
  wsServer: WebSocketServer;
  clients: Map<number, NetworkClient> = new Map();
  rooms: Map<string, Room> = new Map();

  private _roomTemplates: Map<string, RoomDefinition> = new Map();

  constructor() {}

  listen(port: number) {
    this.wsServer = new WebSocketServer(port);

    this.wsServer.on('connected', this._onOpen.bind(this));
    this.wsServer.on('disconnected', this._onClose.bind(this));
    this.wsServer.on('message', this._onMessage.bind(this));

    this.wsServer.start();
  }

  define(name: string, template: typeof Room, opts?: any) {
    console.log(
      '[Server]',
      `defining room template ${name} with type ${template.name} and options`,
      opts
    );
    this._roomTemplates.set(name, { template, opts });
  }

  createRoom(id: string, templateName: string) {
    const roomDefinition = this._roomTemplates.get(templateName);
    const room = new roomDefinition.template(id, roomDefinition.opts);
    this.rooms.set(room.id, room);

    return room;
  }

  destroyRoom(room: Room) {
    this.rooms.delete(room.id);
    room._internalCleanup();
  }

  private _onOpen(client: NetworkClient) {
    console.log(`Client ${client.id} connected`);

    this.clients.set(client.id, client);
  }

  private _onClose(client: NetworkClient, code: number, reason: Buffer) {
    console.log(`Client ${client.id} disconnected`);

    client.room?._internalOnClose(client, code, reason);

    this.clients.delete(client.id);
  }

  private _joinOrClose(client: NetworkClient, room: Room) {
    if (!client.canJoinFullRooms && room.isFull()) {
      client.close(0, 'room is full');
      return;
    }

    client.status = ClientStatus.JOINED;
    client.room = room;
    client.room._internalOnOpen(client);
  }

  private _onMessage(client: NetworkClient, buf: Buffer) {
    const ref: NumberRef = { value: 0 };

    const packetId = <ClientProtocol>buf.readUInt8(ref.value++);

    switch (packetId) {
      case ClientProtocol.JoinRoom: {
        // Check if client is already connected
        if (client.status > ClientStatus.CONNECTED) {
          client.close(0, 'bad request');
          break;
        }

        // Join existing room
        client.status = ClientStatus.JOINING;

        // Deserialize auth string
        const authStringLen = buf.readUInt16LE(ref.value);
        ref.value += 2;
        const authString = buf.toString(
          'utf16le',
          ref.value,
          ref.value + authStringLen * 2
        );
        ref.value += authStringLen * 2;

        // Deserialize room id
        const roomIdLen = buf.readUInt16LE(ref.value);
        ref.value += 2;
        const roomId = buf.toString(
          'utf16le',
          ref.value,
          ref.value + roomIdLen * 2
        );
        ref.value += roomIdLen * 2;

        // Join room if it exists
        if (this.rooms.has(roomId)) {
          const room = this.rooms.get(roomId);
          try {
            room.onClientAuth(client, authString);
            this._joinOrClose(client, room);
          } catch (e) {
            client.close(0, e.message);
            throw e;
          }
        } else {
          client.close(0, 'room does not exist');
        }

        break;
      }

      case ClientProtocol.UserPacket:
        if (client.status !== ClientStatus.JOINED) {
          client.close(0, 'bad request');
          break;
        }
        // Pass message to room
        client.room._internalOnUserMessage(client, buf, ref);
        break;

      case ClientProtocol.Ping:
        // Ignore ping if the client is closing
        if (client.status >= ClientStatus.CLOSING) {
          break;
        }

        // Send pong
        client._internalSend(PACKET_PING);
        break;

      default:
        break;
    }
  }
}
