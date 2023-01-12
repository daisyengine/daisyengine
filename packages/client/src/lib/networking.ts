export default class Networking {
  private _ws?: WebSocket;

  onOpen?: (e: Event) => void;
  onClose?: (e: Event) => void;
  onMessage?: (e: Buffer) => void;

  constructor() {}

  connect(url: string) {
    this.disconnect();
    this._ws = new WebSocket(url);
    this._ws.binaryType = 'arraybuffer';
    this._ws.onmessage = this._onMessage.bind(this);
    this._ws.onopen = this._onOpen.bind(this);
    this._ws.onclose = this._onClose.bind(this);
  }

  connectAsync(url: string) {
    return new Promise<void>((resolve, reject) => {
      this._ws = new WebSocket(url);
      this._ws.binaryType = 'arraybuffer';
      this._ws.onmessage = this._onMessage.bind(this);
      this._ws.onclose = this._onClose.bind(this);
      this._ws.onopen = (e) => {
        this._onOpen(e);
        resolve();
      };
      this._ws.onerror = (err) => {
        reject(err);
      };
    });
  }

  isConnected() {
    return this._ws?.readyState == this._ws?.OPEN;
  }

  disconnect() {
    this._ws?.close(0, 'disconnect()');
  }

  send(buf: Buffer) {
    this._ws?.send(buf);
  }

  private _onMessage(e: MessageEvent) {
    if (e.data instanceof ArrayBuffer) {
      this.onMessage?.call(undefined, Buffer.from(e.data));
    }
  }

  private _onOpen(e: Event) {
    this.onOpen?.call(undefined, e);
  }

  private _onClose(e: Event) {
    this.onClose?.call(undefined, e);
  }
}
