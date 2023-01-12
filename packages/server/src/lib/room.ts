import { ClientStatus, NetworkClient } from './network-client';
import {
  deserializeString,
  deserializeUInt8,
  NumberRef,
  Schema,
  SchemaData,
  serializeString,
  serializeUInt8,
} from '@daisy-engine/serializer';
import { ServerProtocol } from '@daisy-engine/common';

const buf = Buffer.alloc(1024000); // Packet size can NOT exceed 1mb.
// ^ TODO Let user configure this

type MessageHandler = (client: NetworkClient, message: Buffer | string) => void;

export class Room<T extends Schema> {
  /** Unique ID of this room */
  readonly id: string;

  /** State of this room */
  state: T;

  /** Number of clients that may connect to this room */
  maxClients: number = Infinity;

  /**
   * A map of clients.
   * Key is the {@link NetworkClient.id}.
   */
  clients: Map<number, NetworkClient>;

  private _messageHandlers: Map<string | number, MessageHandler>;

  private _tickNumber: number;
  private _lastTime: number;
  private _accumulator: number;
  private _deltaTime: number;
  private _maxAccumulation: number = 25;
  private _stopTicking: boolean;
  private _lastStateChange: number = -1;
  private _disableBuiltinTicker: boolean;

  /**
   * Current tick number.
   * Increased by 1 every time tick() gets called.
   */
  get tickNumber(): number {
    return this._tickNumber;
  }
  /**
   * Current accumulated frame time, in milliseconds.
   */
  get accumulator(): number {
    return this._accumulator;
  }
  /**
   * Fixed time between ticks, in milliseconds.
   */
  get deltaTime(): number {
    return this._deltaTime;
  }

  constructor(id: string, opts?: any) {
    this.id = id;

    this.clients = new Map();
    this._messageHandlers = new Map();

    this._tickNumber = 0;

    this.init(opts);
    this._postInit();
  }

  /**
   * Called when this room is ready to be initialized.
   */
  protected init(opts?: any) {}

  /**
   * Called every {@link deltaTime} milliseconds.
   */
  protected tick() {}

  /**
   * How many times should {@link tick} be called?
   *
   * Set to 0 if you want to disable the built-in ticker.
   * @param ticksPerSecond Number of ticks per second.
   */
  setTickRate(ticksPerSecond: number) {
    if (ticksPerSecond <= 0) this._disableBuiltinTicker = true;
    this._deltaTime = 1000 / ticksPerSecond;
  }

  /**
   * Sets the maximum number of milliseconds that can be accumulated in one
   * frame.
   * @param maxAccumulation Maximum number of milliseconds that can be
   * accumulated.
   */
  setMaxAccumulation(maxAccumulation: number) {
    this._maxAccumulation = maxAccumulation;
  }

  /**
   * Called before this room is closed.
   */
  cleanup() {}

  /**
   * Authenticates the client. If this method throws an exception,
   * authentication will fail with exception message.
   * @param client Client to authenticate
   * @param authString The authentication string passed from client
   */
  onClientAuth(client: NetworkClient, authString: string) {}

  /**
   * Called when a client joins the room
   * @param client
   */
  onClientJoined(client: NetworkClient) {}

  /**
   * Called when a client leaves the room
   * @param client
   */
  onClientLeft(client: NetworkClient) {}

  /**
   * Checks if this room is full.
   * You might override this method to account for
   * seats reserved by whatever matchmaker you're using.
   * @returns `true` if room is full
   */
  isFull() {
    return this.clients.size >= this.maxClients;
  }

  /**
   * Registers a handler for `event`
   * @param event Unique identifier for this event.
   *
   * Using a `string` for event ids is not recommended as it makes the network
   * packet considerably bigger (2 bytes for length and an extra 2 bytes for
   * every character in string).
   *
   * You may use any number from 0 to 255.
   * @param handler The {@link MessageHandler} function that will be called when
   * this event is received.
   */
  onMessage(event: string | number, handler: MessageHandler) {
    if (typeof event === 'number' && (event > 255 || event < 0))
      throw new Error('When using numbers, Event ID must be in range 0-255!');

    this._messageHandlers[event] = handler;
  }

  /**
   * Sends a message to a specific client
   * @param client {@link NetworkClient} that will receive the message
   * @param event Unique identifier for this event. See {@link onMessage}
   * for more info about event identifiers.
   * @param data Data that will be sent to this client.
   */
  send<T = string | number, T2 = Buffer | string>(
    client: NetworkClient,
    event: T,
    data: T2
  ) {
    if (client.status !== ClientStatus.JOINED) return;
    client._internalSend(this._packMessage(event, data));
  }

  /**
   * Sends a message to everyone in this room.
   * @param event Unique identifier for this event. See {@link onMessage}
   * for more info about event identifiers.
   * @param data Data that will be broadcasted.
   */
  broadcast<T = string | number, T2 = Buffer | string>(event: T, data: T2) {
    const msg = this._packMessage(event, data);
    this._broadcast(msg);
  }

  /**
   * Called before this room is closed.
   * @internal
   */
  _internalCleanup() {
    this.cleanup();
  }

  /**
   * Handles connections.
   * @internal
   */
  _internalOnOpen(client: NetworkClient) {
    this._sendSchemaDefinition(client);
    this._sendFullState(client);
    this._sendRoomInfo(client);
    this.clients.set(client.id, client);

    console.log(`Client ${client.id} connected`);

    this.onClientJoined(client);
  }

  /**
   * Handles disconnects.
   * @internal
   */
  _internalOnClose(client: NetworkClient, code: number, reason: Buffer) {
    this.clients.delete(client.id);

    console.log(`Client ${client.id} disconnected (Code ${code})`);

    this.onClientLeft(client);
  }

  /**
   * Magically turns a `Buffer` into a message that's easier to work with.
   * @internal
   */
  _internalOnUserMessage(client: NetworkClient, buf: Buffer, ref: NumberRef) {
    const eventType = deserializeUInt8(buf, ref);

    switch (eventType) {
      case 0: {
        // Number event
        const event = deserializeUInt8(buf, ref);

        this._messageHandlers[event]?.call(
          this,
          client,
          this._getUserMessageContent(buf, ref)
        );
        break;
      }
      case 1: {
        // String event
        const event = deserializeString(buf, ref);
        this._messageHandlers[event]?.call(
          this,
          client,
          this._getUserMessageContent(buf, ref)
        );

        break;
      }
    }
  }

  /**
   * Runs after {@link init}
   */
  private _postInit() {
    this.state._internalOnDirty = () => {
      this._lastStateChange = this.tickNumber;
    };

    if (!this._disableBuiltinTicker) {
      this._lastTime = this._now();
      this._accumulator = 0;

      this._stopTicking = false;
      this._tick();
    }
  }

  /**
   * @returns High resolution timestamp if available
   */
  private _now() {
    if (performance !== undefined) {
      return performance.now();
    }
    if (window !== undefined) {
      if (window.performance.now) {
        return window.performance.now();
      } else {
        return Date.now();
      }
    }
  }

  /**
   * Built-in ticker.
   *
   * See {@link https://gafferongames.com/post/fix_your_timestep/} for more
   * info.
   */
  private _tick() {
    const newTime = this._now();
    const frameTime = Math.min(this._maxAccumulation, newTime - this._lastTime);

    this._lastTime = newTime;
    this._accumulator += frameTime;

    while (this._accumulator >= this._deltaTime) {
      if (this._stopTicking || this._disableBuiltinTicker) return;

      this.tick();
      this.sendStateUpdates();

      this._accumulator -= this._deltaTime;
      this._tickNumber++;
    }

    setImmediate(() => this._tick());
  }

  /**
   * Magically reads `data` of a message from a `Buffer`
   * @internal
   */
  private _getUserMessageContent(buf: Buffer, ref: NumberRef) {
    const dataType = deserializeUInt8(buf, ref);

    switch (dataType) {
      case 0:
        // Buffer data
        return buf.subarray(ref.value);
      case 1:
        // String data
        return deserializeString(buf, ref);
      default:
        throw new Error(`Invalid dataType for message: ${dataType}`);
    }
  }

  /**
   * Magically turns event and data into a `Buffer` that the client will
   * understand.
   * @internal
   */
  private _packMessage<T = string | number, T2 = Buffer | string>(
    event: T,
    data: T2
  ) {
    let ref: NumberRef = { value: 0 };
    serializeUInt8(ServerProtocol.UserPacket, buf, ref);
    if (typeof event === 'number') {
      // Event is uint8
      serializeUInt8(0, buf, ref);
      serializeUInt8(event, buf, ref);
    } else if (typeof event === 'string') {
      // Event is string
      serializeUInt8(1, buf, ref);
      serializeString(event, buf, ref);
    }

    if (data instanceof Buffer) {
      // Data is buffer
      serializeUInt8(0, buf, ref);
      ref.value += data.copy(buf, ref.value, 0);
    } else if (typeof data == 'string') {
      // Data is string
      serializeUInt8(1, buf, ref);
      serializeString(data, buf, ref);
    }

    return buf.subarray(0, ref.value);
  }

  /**
   * Calling this method will broadcast the latest state patch to everyone.
   * If nothing has changed since the last call to this method, it will not do
   * anything.
   *
   * You should probably call this in your application's update loop ***if***
   * you are not using the built-in ticker.
   */
  protected sendStateUpdates() {
    if (this.state._internalChangeTree.size() === 0) return;

    const ref: NumberRef = { value: 0 };
    serializeUInt8(ServerProtocol.RoomState, buf, ref);
    this.state._internalSerialize(buf, ref);

    const byteArray = buf.subarray(0, ref.value);

    for (const [_, client] of this.clients) {
      if (
        client.status !== ClientStatus.JOINED ||
        client.lastSentStateUpdateTick >= this._lastStateChange
      )
        continue;
      client.lastSentStateUpdateTick = this._lastStateChange;
      client._internalSend(byteArray);
    }
  }

  /**
   * Sends the schema definition to a client.
   * @param client
   */
  private _sendSchemaDefinition(client: NetworkClient) {
    const ref: NumberRef = { value: 0 };

    serializeUInt8(ServerProtocol.RoomSchemaDefinition, buf, ref);

    this._serializeSchemaDefinition(
      this.state.constructor as typeof Schema,
      buf,
      ref
    );

    client._internalSend(buf.subarray(0, ref.value));
  }

  /**
   * Creates a Schema definition.
   */
  private _serializeSchemaDefinition(
    schema: typeof Schema,
    buf: Buffer,
    ref: NumberRef
  ) {
    const data = <SchemaData>(schema as any).__data;
    serializeUInt8(data.ids.size, buf, ref);
    //console.log(schema);
    for (const [k, id] of data.ids) {
      const type = data.types.get(id);
      const isArraySchema = data.arraySchemaIds.has(id);
      serializeString(k, buf, ref);
      serializeUInt8(id, buf, ref);
      serializeString(type, buf, ref);
      serializeUInt8(isArraySchema ? 1 : 0, buf, ref);

      if (type === '$schema') {
        // We need the type of `schema[k]`. We could use schema[k].constructor
        // and cast it to 'typeof Schema' but then we'd need to check for
        // ArraySchema<T> and get type from __schemaTypes here anyway, so let's
        // just use __schemaTypes for all types that has a Schema in them.
        // Schema, [Schema], Map<K|V=Schema>?
        const value = data.schemaTypes.get(id);
        this._serializeSchemaDefinition(value, buf, ref);
      }
    }
  }

  /**
   * Sends room info to specified `client`
   * @param client
   * @internal
   */
  private _sendRoomInfo(client: NetworkClient) {
    const ref: NumberRef = { value: 0 };
    serializeUInt8(ServerProtocol.RoomInfo, buf, ref);
    serializeString(this.id, buf, ref);

    client._internalSend(buf.subarray(0, ref.value));
  }

  /**
   * Sends full room state to specified `client`
   *
   * Used to sync room state on join
   * @param client
   * @internal
   */
  private _sendFullState(client: NetworkClient) {
    const ref: NumberRef = { value: 0 };
    serializeUInt8(ServerProtocol.RoomState, buf, ref);
    this.state._internalSerialize(buf, ref, true);

    client.lastSentStateUpdateTick = this._lastStateChange;
    client._internalSend(buf.subarray(0, ref.value));
  }

  private _broadcast(msg: Buffer) {
    for (const [_, client] of this.clients) {
      if (client.status !== ClientStatus.JOINED) continue;
      client._internalSend(msg);
    }
  }
}
