import { ClientProtocol } from '@daisyengine/common';
import {
  NumberRef,
  serializeUInt8,
  serializeString,
} from '@daisyengine/serializer';
import { Room } from './room';

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