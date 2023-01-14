import { deserializeBoolean, serializeBoolean } from './bool';
import { serializeFloat32, deserializeFloat32 } from './float32';
import { serializeInt16, deserializeInt16 } from './int16';
import { serializeInt32, deserializeInt32 } from './int32';
import { serializeInt8, deserializeInt8 } from './int8';
import { serializeJson, deserializeJson } from './json';
import { serializeString, deserializeString } from './string';
import { serializeUInt16, deserializeUInt16 } from './uint16';
import { serializeUInt32, deserializeUInt32 } from './uint32';
import { serializeUInt8, deserializeUInt8 } from './uint8';

export { serializeInt8, deserializeInt8 };
export { serializeInt16, deserializeInt16 };
export { serializeInt32, deserializeInt32 };
export { serializeUInt8, deserializeUInt8 };
export { serializeUInt16, deserializeUInt16 };
export { serializeUInt32, deserializeUInt32 };
export { serializeFloat32, deserializeFloat32 };
export { serializeString, deserializeString };
export { serializeJson, deserializeJson };
export { serializeBoolean, deserializeBoolean };

/**
 * A map of registered serializers, used by `@sync(key)`
 */
export const registeredSerializers = new Map<string, [Function, Function]>([
  ['int8', [serializeInt8, deserializeInt8]],
  ['int16', [serializeInt16, deserializeInt16]],
  ['int32', [serializeInt32, deserializeInt32]],
  ['uint8', [serializeUInt8, deserializeUInt8]],
  ['uint16', [serializeUInt16, deserializeUInt16]],
  ['uint32', [serializeUInt32, deserializeUInt32]],
  ['float32', [serializeFloat32, deserializeFloat32]],
  ['json', [serializeJson, deserializeJson]],
  ['string', [serializeString, deserializeString]],
  ['bool', [serializeBoolean, deserializeBoolean]],
]);
