import { NumberRef, ServerProtocol } from '@daisy-engine/common';
import * as uWS from 'uWebSockets.js';
import { ClientStatus } from './ClientStatus';
import { Room } from './Room';

/**
 * Number of milliseconds to wait before connecting a connection.
 * Useful to ensure close reason is sent to the client.
 */
const CLOSE_DELAY = 2500;
export class NetworkClient {
  static _lastClientId: number = 1;
  private _ws: uWS.WebSocket;

  readonly id: number;

  /**
   * The room this client is in
   */
  room?: Room;

  /**
   * Whether or not this client should bypass the client count check.
   */
  canJoinFullRooms: boolean;

  /**
   * Connection status
   */
  status: ClientStatus = ClientStatus.CONNECTED;

  /**
   * Tick number of the latest state update sent to this client.
   */
  lastSentStateUpdateTick: number = Number.NEGATIVE_INFINITY;

  /**
   * Custom data associated with this NetworkClient. You may set this to
   * anything.
   */
  data: any;

  /**
   * Custom auth data associated with this NetworkClient. You may set this to
   * anything.
   */
  auth: any;

  constructor(ws: uWS.WebSocket, id: number) {
    this._ws = ws;

    this.id = id;
  }

  /**
   * Disconnects a client
   * @param code WebSocket close code
   * @param reason WebSocket close reason, also sent as a CloseReason to the
   * client.
   * @returns
   */
  close(code: number = 0, reason: string = null) {
    if (this.status === ClientStatus.CLOSING) return;
    this.status = ClientStatus.CLOSING;

    if (reason !== null) {
      const buf = Buffer.alloc(1 + 2 + reason.length * 2);
      let offset = 0;
      buf.writeUInt8(ServerProtocol.CloseReason, offset++);

      // Write reason
      buf.writeUInt16LE(reason.length, offset);
      offset += 2;
      offset += buf.write(reason, offset, reason.length * 2, 'utf16le');

      this._internalSend(buf);
      setTimeout(() => {
        if (this.status !== ClientStatus.CLOSED) this._ws.end(code, reason);
      }, CLOSE_DELAY);
    } else {
      this._ws.end(code, reason);
    }
  }

  /**
   * Sends a message to this client
   * @param event Unique identifier for this event. See {@link onMessage}
   * for more info about event identifiers.
   * @param data Data that will be sent to this client.
   */
  send<T = string | number, T2 = Buffer | string>(event: T, data: T2) {
    this.room.send(this, event, data);
  }

  _internalSend(buf: Buffer) {
    // TODO handle backpressure
    this._ws.send(buf, true);
  }

  _internalOnClose(code: number) {
    this.status = ClientStatus.CLOSED;
  }

  _internalOnMessage(message: Buffer) {}
}
