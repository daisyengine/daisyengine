import { ClientProtocol } from '@daisyengine/common';
import {
  deserializeString,
  deserializeUInt8,
  NumberRef,
  Schema,
} from '@daisyengine/serializer';
import { ClientStatus, NetworkClient } from './network-client';
import { Room } from './room';
import { WebSocketServer } from './websocket-server';

interface RoomDefinition {
  template: typeof Room<Schema>;
  opts?: any;
}

export class Server {
  wsServer: WebSocketServer;
  clients: Map<number, NetworkClient> = new Map();
  rooms: Map<string, Room<Schema>> = new Map();

  private _roomTemplates: Map<string, RoomDefinition> = new Map();

  constructor() {}

  listen(port: number) {
    this.wsServer = new WebSocketServer(port);

    this.wsServer.on('connected', this._onOpen.bind(this));
    this.wsServer.on('disconnected', this._onClose.bind(this));
    this.wsServer.on('message', this._onMessage.bind(this));

    this.wsServer.start();
  }

  define(name: string, template: typeof Room<Schema>, opts?: any) {
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

  destroyRoom(room: Room<Schema>) {
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

  private _joinOrClose(
    client: NetworkClient,
    authString: string,
    room: Room<any>
  ) {
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

    const packetId = <ClientProtocol>deserializeUInt8(buf, ref);

    switch (packetId) {
      case ClientProtocol.JoinRoom: {
        if (client.status !== ClientStatus.CONNECTED) {
          client.close(0, 'bad request');
          break;
        }

        // Join existing room
        client.status = ClientStatus.JOINING;

        const authString = deserializeString(buf, ref);
        const roomId = deserializeString(buf, ref);

        if (this.rooms.has(roomId)) {
          const room = this.rooms.get(roomId) as Room<Schema>;
          try {
            room.onClientAuth(client, authString);
            this._joinOrClose(client, authString, room);
          } catch (e) {
            client.close(0, e.message);
            throw e;
          }
        } else {
          client.close(0, 'room does not exist');
        }

        break;
      }

      case ClientProtocol.CreateRoom: {
        if (client.status !== ClientStatus.CONNECTED) {
          client.close(0, 'bad request');
          break;
        }
        // Create new room
        client.status = ClientStatus.JOINING;

        const authString = deserializeString(buf, ref);
        const templateName = deserializeString(buf, ref);

        if (!this._roomTemplates.has(templateName)) {
          client.close(0, 'unknown template');
          break;
        }

        try {
          const room = this.createRoom('sample_room_id', templateName);

          room.onClientAuth(client, authString);
          this._joinOrClose(client, authString, room);
        } catch (e) {
          client.close(0, e.message);
          throw e;
        }
        break;
      }

      case ClientProtocol.UserPacket:
        if (client.status !== ClientStatus.JOINED) {
          client.close(0, 'bad request');
          break;
        }
        client.room._internalOnUserMessage(client, buf, ref);
        break;

      default:
        break;
    }
  }
}
