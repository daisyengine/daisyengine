import { ServerProtocol } from '@daisy-engine/common';
import {
  NumberRef,
  serializeString,
  serializeUInt8,
} from '@daisy-engine/serializer';
import * as uWS from 'uWebSockets.js';
import { Room } from './room';

/**
 * Connection status of a NetworkClient
 */
export enum ClientStatus {
  CONNECTED,
  JOINING,
  JOINED,
  CLOSING,
  CLOSED,
}

/**
 * Number of milliseconds to wait before connecting a connection.
 * Useful to ensure close reason is sent to the client.
 */
const CLOSE_DELAY = 2500;
export class NetworkClient {
  static _lastClientId: number = 0;
  private _ws: uWS.WebSocket;

  readonly id: number;

  /**
   * The room this client is in
   */
  room?: Room<any> = null;

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
      const ref: NumberRef = { value: 0 };
      serializeUInt8(ServerProtocol.CloseReason, buf, ref);
      serializeString(reason, buf, ref);
      this._internalSend(buf);
      setTimeout(() => {
        if (this.status !== ClientStatus.CLOSED) this._ws.end(code, reason);
      }, CLOSE_DELAY);
    } else {
      this._ws.end(code, reason);
    }
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
