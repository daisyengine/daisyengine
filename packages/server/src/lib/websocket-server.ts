import * as uWS from 'uWebSockets.js';
import { EventEmitter } from 'eventemitter3';
import { NetworkClient } from './network-client';

export class WebSocketServer {
  readonly port: number;
  private _app: uWS.TemplatedApp;
  public get app(): uWS.TemplatedApp {
    return this._app;
  }

  private _clients: Map<uWS.WebSocket, NetworkClient>;
  private _events: EventEmitter;

  constructor(port: number) {
    this.port = port;
    this._clients = new Map();
    this._events = new EventEmitter();
  }

  on(event: string | symbol, fn: (...args: any[]) => void, context?: any) {
    this._events.on(event, fn, context);
  }

  off(event: string | symbol, fn: (...args: any[]) => void, context?: any) {
    this._events.off(event, fn, context);
  }

  private _onMessage(ws: uWS.WebSocket, message: Buffer, isBinary: boolean) {
    if (!isBinary) return;
    const client = this._clients.get(ws) as NetworkClient;
    client._internalOnMessage(message);
    this._events.emit('message', client, message);
  }

  private _onOpen(ws: uWS.WebSocket) {
    const client = new NetworkClient(ws, NetworkClient._lastClientId++);
    this._clients.set(ws, client);
    this._events.emit('connected', client);
  }

  private _onClose(ws: uWS.WebSocket, code: number) {
    const client = this._clients.get(ws) as NetworkClient;
    client._internalOnClose(code);
    this._clients.delete(ws);
    this._events.emit('disconnected', client, code, null);
  }

  start() {
    this._app = uWS
      ./*SSL*/ App({})
      .ws('/', {
        /* Options */
        compression: uWS.SHARED_COMPRESSOR,
        maxPayloadLength: 16 * 1024 * 1024,
        idleTimeout: 32,
        /* Handlers */
        open: (ws) => this._onOpen(ws),
        message: (ws, message, isBinary) =>
          this._onMessage(ws, Buffer.from(message), isBinary),
        drain: (ws) => {
          // TODO HANDLE BACKPRESSURE
          console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
        },
        close: (ws, code) => this._onClose(ws, code),
      })
      .any('/*', (res, req) => {
        res.end('Nothing to see here!');
      })
      .listen(this.port, (token) => {
        if (token) {
          console.log(`[WebSocketServer] Listening to port ${this.port}`);
        } else {
          console.log(
            '[WebSocketServer] Failed to listen to port ' + this.port
          );
        }
      });
  }
}
