import { ClientProtocol, ServerProtocol } from '@daisyengine/common';
import {
  ArrayChangeType,
  deserializeString,
  deserializeUInt16,
  deserializeUInt8,
  NumberRef,
  registeredSerializers,
  serializeString,
  serializeUInt8,
} from '@daisyengine/serializer';
import Networking from './networking';

type MessageHandler = (message: Buffer | string) => void;

interface SchemaDefinition {
  ids: Map<string, number>;
  types: Map<number, string>;
  arraySchemaIds: Set<number>;
  keys: Map<number, string>;
  childDefinitions: Map<number, SchemaDefinition>;
}

interface SchemaDefinitionJSON {
  ids: { [key: string]: number };
  keys: { [key: number]: string };
  arraySchemaIds: number[];
  types: { [key: number]: string };
  childDefinitions: { [key: number]: SchemaDefinitionJSON };
}

interface Changed {
  key: string;
  oldValue: any;
  newValue: any;
}

interface ArraySchemaOperation {
  oldValue?: any;
  newValue?: any;
}

type OnChangeCallback = (key: string, oldValue: any, newValue: any) => void;
type OnAddedCallback = (index: number, value: any) => void;
type OnRemovedCallback = (index: number, value: any) => void;
type OnItemChangeCallback = (
  index: number,
  oldValue: any,
  newValue: any
) => void;

export class Room {
  private _id!: string;
  private _sendBuffer: Buffer;
  private _closeReason: string | undefined;

  get closeReason(): string | undefined {
    return this._closeReason;
  }

  get id(): string {
    return this._id;
  }

  private _state: any;
  get state(): any {
    return this._state;
  }

  private _schemaDefinition: SchemaDefinition | undefined;

  private _net: Networking;
  private _connectResultCallback?: (error?: string) => void;
  private _messageHandlers: Map<string | number, MessageHandler>;
  private _closeCallbacks: Set<(e: Event) => void>;
  private _serverErrorCallbacks: Set<(error: string) => void>;

  constructor() {
    this._net = new Networking();
    this._messageHandlers = new Map();
    this._closeCallbacks = new Set();
    this._serverErrorCallbacks = new Set();

    this._sendBuffer = Buffer.alloc(1 * 1024 * 1024);
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

    this._messageHandlers.set(event, handler);
  }

  onClose(callback: (e: Event) => void) {
    this._closeCallbacks.add(callback);
  }

  onError(callback: (error: string) => void) {
    this._serverErrorCallbacks.add(callback);
  }

  send(event: string | number, message: Buffer | string) {
    this._net.send(this._packMessage(event, message));
  }

  async _internalConnect(serverAddr: string, packet: Buffer) {
    this._net.onOpen = this._onOpen.bind(this);
    this._net.onClose = this._onClose.bind(this);
    this._net.onMessage = this._onMessage.bind(this);

    return new Promise<void>(async (resolve, reject) => {
      this._connectResultCallback = (error) => {
        if (error) return reject(error);

        resolve();
      };

      // Wait for connection
      await this._net.connectAsync(serverAddr);

      // Send init packet
      this._net.send(packet);
    });
  }

  private _onOpen(e: Event) {
    //console.log('[Room] Connected to server %s', this._addr);
  }

  private _onClose(e: Event) {
    //console.log('[Room] Disconnected from server', e);
    for (const callback of this._closeCallbacks) {
      callback.call(undefined, e);
    }
  }

  private _onMessage(buf: Buffer) {
    const ref: NumberRef = { value: 0 };
    const packetId = <ServerProtocol>deserializeUInt8(buf, ref);
    //console.log('Received', ServerProtocol[packetId]);
    switch (packetId) {
      case ServerProtocol.UserPacket:
        this._onUserMessage(buf, ref);
        break;
      case ServerProtocol.RoomSchemaDefinition:
        this._schemaDefinition = {
          ids: new Map(),
          arraySchemaIds: new Set(),
          types: new Map(),
          keys: new Map(),
          childDefinitions: new Map(),
        };
        this._state = this._createEmptyState();
        this._defineSchema(this.state, this._schemaDefinition, buf, ref);
        console.log(
          'Room schema defined by server',
          JSON.stringify(this._schemaDefinitionToJSON(this._schemaDefinition))
        );

        break;
      case ServerProtocol.RoomInfo:
        this._id = deserializeString(buf, ref);

        if (this._connectResultCallback) {
          this._connectResultCallback?.call(undefined);
        }

        break;
      case ServerProtocol.RoomState:
        if (!this._schemaDefinition)
          throw new Error('RoomState received before SchemaDefinition!');

        this._deserializeSchema(
          this.state,
          <SchemaDefinition>this._schemaDefinition,
          buf,
          ref
        );
        //console.log(this.state);

        break;
      case ServerProtocol.Error:
        const error = deserializeString(buf, ref);
        console.error('[SERVER ERROR]', error);

        if (this._connectResultCallback) {
          this._connectResultCallback?.call(undefined, error);
        }

        for (const callback of this._serverErrorCallbacks) {
          callback.call(undefined, error);
        }

        break;
      case ServerProtocol.CloseReason:
        const reason = deserializeString(buf, ref);
        console.log('[CLOSE REASON]', reason);

        if (this._connectResultCallback) {
          this._connectResultCallback?.call(undefined, reason);
        }

        this._closeReason = reason;

        break;
      default:
        break;
    }
  }

  private _createEmptyState() {
    const state: any = {
      __daisy: {
        onChangeCallbacks: new Set(),

        arrayOnAddedCallbacks: new Set(),
        arrayOnRemovedCallbacks: new Set(),
        arrayOnItemChangeCallbacks: new Set(),
        arraySchemaStates: new Map(),
      },
    };
    // onChange
    state.onChange = (callback: OnChangeCallback) =>
      state.__daisy.onChangeCallbacks.add(callback);
    // listen
    state.listen = (
      key: string,
      callback: (oldValue: any, newValue: any) => void
    ) => {
      const fn = (k: string, oldValue: any, newValue: any) => {
        if (key === k) {
          callback(oldValue, newValue);
        }
      };
      state.__daisy.onChangeCallbacks.add(fn);
      return () => state.__daisy.onChangeCallbacks.delete(fn);
    };
    // onAdded
    state.onAdded = (callback: OnAddedCallback) => {
      state.__daisy.arrayOnAddedCallbacks.add(callback);
      return () => state.__daisy.arrayOnAddedCallbacks.delete(callback);
    };
    // onRemoved
    state.onRemoved = (callback: OnRemovedCallback) => {
      state.__daisy.arrayOnRemovedCallbacks.add(callback);
      return () => state.__daisy.arrayOnRemovedCallbacks.delete(callback);
    };
    // onItemChange
    state.onItemChange = (callback: OnItemChangeCallback) => {
      state.__daisy.arrayOnItemChangeCallbacks.add(callback);
      return () => state.__daisy.arrayOnItemChangeCallbacks.delete(callback);
    };

    // ArraySchema methods
    state.toArray = () => {
      return Array.from(state.__daisy.arraySchemaStates.values());
    };
    state.get = (i: number) => {
      return state.__daisy.arraySchemaStates.get(i);
    };
    state.triggerCallbacks = () => {
      // Trigger Schema callbacks
      const keys = Object.keys(state).filter((item) => {
        return ![
          '__daisy',
          'onChange',
          'listen',
          'onAdded',
          'onRemoved',
          'onItemChange',
          'toArray',
          'get',
          'triggerCallbacks',
        ].includes(item);
      });

      console.log(keys);
      // Trigger Schema callbacks
      for (const key of keys) {
        for (const callback of state.__daisy.onChangeCallbacks) {
          if (typeof state[key] === 'object') continue;
          console.log(key);
          callback(key, undefined, state[key]);
        }
      }

      // Trigger ArraySchema callbacks
      for (const [index, value] of state.__daisy.arraySchemaStates) {
        console.log(index, value);
        for (const callback of state.__daisy.arrayOnAddedCallbacks) {
          callback(index, value);
        }
      }
    };

    return state;
  }

  private _schemaDefinitionToJSON(
    definition: SchemaDefinition
  ): SchemaDefinitionJSON {
    const o: SchemaDefinitionJSON = {
      ids: {},
      keys: {},
      arraySchemaIds: [],
      types: {},
      childDefinitions: {},
    };
    for (const [key, id] of definition.ids) {
      o.ids[key] = id;
      o.keys[id] = key;
      if (definition.arraySchemaIds.has(id)) o.arraySchemaIds.push(id);
      o.types[id] = <string>definition.types.get(id);
      for (const [_, child] of definition.childDefinitions) {
        o.childDefinitions[id] = this._schemaDefinitionToJSON(child);
      }
    }
    return o;
  }

  private _deserializeArraySchema(
    state: any,
    definition: SchemaDefinition,
    buf: Buffer,
    ref: NumberRef,
    propId: number
  ) {
    const key = <string>definition.keys.get(propId);
    const dataType = <string>definition.types.get(propId);

    // Create object for ArraySchema if it doesn't exist
    if (!state[key]) {
      console.log(`Create new state for key ${key}`);
      state[key] = this._createEmptyState();
    }

    // Get Map for this ArraySchema
    const map = <Map<number, any>>state[key].__daisy.arraySchemaStates;

    // Get number of changes
    const length = deserializeUInt16(buf, ref);

    // Loop over each change
    for (let i = 0; i < length; i++) {
      const index = deserializeUInt16(buf, ref);
      const changeType = <ArrayChangeType>deserializeUInt8(buf, ref);

      // If change type is Insert
      if (changeType === ArrayChangeType.Insert) {
        // If array type is ArraySchema<T=Schema>
        if (dataType === '$schema') {
          // Create new state object for this Schema.
          const insertedState = this._createEmptyState();
          // Deserialize the schema into created state object
          this._deserializeSchema(
            insertedState,
            <SchemaDefinition>definition.childDefinitions.get(propId),
            buf,
            ref
          );
          console.log(`Inserted ${index} =`, insertedState);
          // Set map[index] = created state object.
          map.set(index, insertedState);
          // TODO Invoke callbacks here?
          for (const callback of state[key].__daisy.arrayOnAddedCallbacks)
            callback(index, insertedState);
        }
        // If array type is ArraySchema<T=Primitive or custom type>
        else {
          // Get serializer for this data type
          const serializer = registeredSerializers.get(dataType);
          // Deserialize the value
          const insertedValue = serializer?.[1](buf, ref);
          // Set map[index] = value
          map.set(index, insertedValue);
          // TODO Invoke callbacks here?
          for (const callback of state[key].__daisy.arrayOnAddedCallbacks)
            callback(index, insertedValue);
        }
      }
      // If change type is Update
      else if (changeType === ArrayChangeType.Update) {
        // If array type is ArraySchema<T=Schema>
        if (dataType === '$schema') {
          // Get existing state object for this Schema
          const itemState = map.get(index);
          if (itemState === undefined) {
            console.error(
              `State was undefined for Schema in ArraySchema during Update operation! Index in array '${index}'. Current map:`,
              map
            );
            throw new Error(
              `State was undefined for Schema in ArraySchema during Update operation!`
            );
          }

          // Deserialize the schema into existing state object
          this._deserializeSchema(
            itemState,
            <SchemaDefinition>definition.childDefinitions.get(propId),
            buf,
            ref
          );
          // Set map[index] = existing state object.
          // map.set(index, itemState); <- Not necessary!
          // ! We don't invoke callbacks for schema changes here.
        } else {
          // Get serializer for this data type
          const serializer = registeredSerializers.get(dataType);
          // Get old value
          const oldValue = map.get(index);
          // Deserialize the value
          const updatedValue = serializer?.[1](buf, ref);
          // Set map[index] = value
          map.set(index, updatedValue);
          // TODO Invoke callbacks here?
          for (const callback of state[key].__daisy.arrayOnItemChangeCallbacks)
            callback(index, oldValue, updatedValue);
        }
      }
    }
  }

  private _deserializeSchema(
    state: any,
    definition: SchemaDefinition,
    buf: Buffer,
    ref: NumberRef
  ) {
    const length = deserializeUInt8(buf, ref);

    for (let i = 0; i < length; i++) {
      const propId = deserializeUInt8(buf, ref);

      // If property is ArraySchema
      if (definition.arraySchemaIds.has(propId)) {
        this._deserializeArraySchema(state, definition, buf, ref, propId);
      }
      // If property is not ArraySchema
      else {
        const key = <string>definition.keys.get(propId);
        const dataType = <string>definition.types.get(propId);

        // If value is Schema
        if (dataType === '$schema') {
          // Deserialize schema value into state[key]
          this._deserializeSchema(
            state[key],
            <SchemaDefinition>definition.childDefinitions.get(propId),
            buf,
            ref
          );
        }
        // If value is primitive/custom
        else {
          const serializer = registeredSerializers.get(dataType);
          const oldValue = state[key];
          const newValue = serializer?.[1](buf, ref);
          state[key] = newValue;
          // TODO Invoke callbacks here?
          for (const callback of state.__daisy.onChangeCallbacks)
            callback(key, oldValue, newValue);
        }
      }
    }

    //   // If data is ArraySchema of `dataType`.
    //   if (definition.arraySchemaIds.has(propId)) {
    //     // Make sure arraySchemaStates[propId] exists
    //     const array = state[key].__daisy.arraySchemaStates;
    //     const changesLength = deserializeInt16(buf, ref);

    //     for (let i = 0; i < changesLength; i++) {
    //       const itemIndex = deserializeUInt16(buf, ref);
    //       const changeType = <ArrayChangeType>deserializeUInt8(buf, ref);
    //       switch (changeType) {
    //         case ArrayChangeType.Insert:
    //             // Callbacks
    //             for (const callback of state[key].__daisy
    //               .arrayOnAddedCallbacks) {
    //               callback.call(undefined, itemState, itemIndex);
    //             }
    //           } else {
    //             // Add primitive value
    //             const serializer = registeredSerializers.get(dataType);
    //             const newValue = serializer?.[1](buf, ref);
    //             array.set(itemIndex, newValue);
    //             // Callbacks
    //             for (const callback of state[key].__daisy
    //               .arrayOnAddedCallbacks) {
    //               callback.call(undefined, newValue, itemIndex);
    //             }
    //           }
    //           break;
    //         case ArrayChangeType.Update:
    //           if (dataType === '$schema') {
    //             console.log('_internalDeserializeState: Changes.Update', key);
    //             // Update Schema value
    //             const itemState = array.get(itemIndex);
    //             console.log(itemIndex, itemState, key, state[key]);
    //             this._internalDeserializeState(
    //               itemState,
    //               <SchemaDefinition>definition.childDefinitions.get(propId),
    //               buf,
    //               ref
    //             );
    //             // Update value of arraySchemaStates[propId][itemIndex]
    //             // array.set(itemIndex, itemState);
    //             // ^ Not needed because objects are passed as refs in js
    //             // Callbacks
    //             // DESIGN: No callbacks for modifications if item is a Schema.
    //             // Schema.onChange should be used instead.
    //           } else {
    //             // Update primitive value
    //             const serializer = registeredSerializers.get(dataType);
    //             const oldValue = array.get(itemIndex);
    //             const newValue = serializer?.[1](buf, ref);
    //             array.set(itemIndex, newValue);
    //             // Callbacks
    //             for (const callback of state[key].__daisy
    //               .arrayOnItemChangeCallbacks) {
    //               callback.call(undefined, oldValue, newValue, itemIndex);
    //             }
    //           }
    //           break;
    //         case ArrayChangeType.Delete:
    //           const value = array.get(itemIndex);
    //           array.delete(itemIndex);
    //           // Callbacks
    //           for (const callback of state[key].__daisy
    //             .arrayOnRemovedCallbacks) {
    //             callback.call(undefined, value, itemIndex);
    //           }
    //           break;
    //         default:
    //           break;
    //       }
    //     }
    //   }
    //   // If data is just `dataType` (Schema or Primitive)
    //   else {
    //     // Schema or primitive
    //     if (dataType === '$schema') {
    //       this._internalDeserializeState(
    //         state[key],
    //         <SchemaDefinition>definition.childDefinitions.get(propId),
    //         buf,
    //         ref
    //       );
    //       continue;
    //     }
    //     const serializer = registeredSerializers.get(dataType);
    //     const oldValue = state[key];
    //     const newValue = serializer?.[1](buf, ref);
    //     state[key] = newValue;
    //     changes.add({ key, oldValue, newValue });
    //   }
    // }
    // for (const callback of state.__daisy.onChangeCallbacks) {
    //   callback.call(undefined, changes);
    // }
  }

  private _defineSchema(
    state: any,
    data: SchemaDefinition,
    buf: Buffer,
    ref: NumberRef
  ) {
    const length = deserializeUInt8(buf, ref);

    for (let i = 0; i < length; i++) {
      const key = deserializeString(buf, ref);
      const id = deserializeUInt8(buf, ref);
      const type = deserializeString(buf, ref);
      const isArraySchema = deserializeUInt8(buf, ref) === 1;
      if (isArraySchema) data.arraySchemaIds.add(id);
      data.ids.set(key, id);
      data.keys.set(id, key);
      data.types.set(id, type);

      if (type === '$schema') {
        state[key] = this._createEmptyState();
        data.childDefinitions.set(id, {
          ids: new Map(),
          types: new Map(),
          arraySchemaIds: new Set(),
          keys: new Map(),
          childDefinitions: new Map(),
        });

        this._defineSchema(
          state[key],
          <SchemaDefinition>data.childDefinitions.get(id),
          buf,
          ref
        );
      }
    }
  }

  private _onUserMessage(buf: Buffer, ref: NumberRef) {
    const eventType = deserializeUInt8(buf, ref);

    switch (eventType) {
      case 0: {
        // Number event
        const event = deserializeUInt8(buf, ref);

        this._messageHandlers
          .get(event)
          ?.call(this, this._getUserMessageContent(buf, ref));
        break;
      }
      case 1: {
        // String event
        const event = deserializeString(buf, ref);

        this._messageHandlers
          .get(event)
          ?.call(this, this._getUserMessageContent(buf, ref));

        break;
      }
    }
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
   * Magically turns event and data into a `Buffer` that the server will
   * understand.
   * @internal
   */
  private _packMessage<T = string | number, T2 = Buffer | string>(
    event: T,
    data: T2
  ) {
    let ref: NumberRef = { value: 0 };
    serializeUInt8(ClientProtocol.UserPacket, this._sendBuffer, ref);
    if (typeof event === 'number') {
      // Event is uint8
      serializeUInt8(0, this._sendBuffer, ref);
      serializeUInt8(event, this._sendBuffer, ref);
    } else if (typeof event === 'string') {
      // Event is string
      serializeUInt8(1, this._sendBuffer, ref);
      serializeString(event, this._sendBuffer, ref);
    }

    if (data instanceof Buffer) {
      // Data is buffer
      serializeUInt8(0, this._sendBuffer, ref);
      ref.value += data.copy(this._sendBuffer, ref.value, 0);
    } else if (typeof data == 'string') {
      // Data is string
      serializeUInt8(1, this._sendBuffer, ref);
      serializeString(data, this._sendBuffer, ref);
    }

    return this._sendBuffer.subarray(0, ref.value);
  }
}
