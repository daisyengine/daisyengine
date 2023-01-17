import { ClientProtocol } from '@daisy-engine/common';
import {
  NumberRef,
  serializeUInt8,
  serializeString,
} from '@daisy-engine/serializer';
import { Room } from './Room';

export class Client {
  private _addr: string;
  private _auth: string;
  constructor(serverAddr: string, authString: string = '') {
    this._addr = serverAddr;
    this._auth = authString;
  }

  async joinRoom(id: string): Promise<Room> {
    var room = new Room();
    const buf = Buffer.alloc(
      1 + (2 + this._auth.length * 2) + (2 + id.length * 2)
    );
    const ref: NumberRef = { value: 0 };
    serializeUInt8(ClientProtocol.JoinRoom, buf, ref);
    serializeString(this._auth, buf, ref);
    serializeString(id, buf, ref);

    await room._internalConnect(this._addr, buf);

    return room;
  }
}
