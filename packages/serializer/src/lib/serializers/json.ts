import { NumberRef } from '../number-ref';
import { deserializeString, serializeString } from './string';

export function serializeJson(
  json: { [key: string]: any },
  buf: Buffer = Buffer.alloc(2097152),
  ref: NumberRef
) {
  const keys = Object.keys(json);

  buf.writeUInt16LE(keys.length, ref.value);
  ref.value += 2;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    serializeString(key, buf, ref);
    if (typeof json[key] === 'string') {
      buf.writeUInt8(0, ref.value);
      ref.value += 1;
      serializeString(json[key], buf, ref);
    } else if (typeof json[key] === 'number') {
      buf.writeUInt8(1, ref.value);
      ref.value += 1;
      buf.writeUInt32LE(json[key], ref.value);
      ref.value += 4;
    } else if (typeof json[key] === 'object') {
      buf.writeUInt8(2, ref.value);
      ref.value += 1;
      serializeJson(json[key], buf, ref);
    } else {
      throw new Error(`Unknown value type: ${typeof json[key]}`);
    }
  }

  return buf.subarray(0, ref.value);
}

export function deserializeJson(
  buf: Buffer,
  ref: NumberRef
): { [key: string]: any } {
  const keysLen = buf.readUInt16LE(0);
  ref.value += 2;

  let obj: { [key: string]: any } = {};

  for (let i = 0; i < keysLen; i++) {
    const key = deserializeString(buf, ref);

    const type = buf.readUInt8(ref.value);
    ref.value += 1;

    if (type === 0) {
      obj[key] = deserializeString(buf, ref);
    } else if (type === 1) {
      obj[key] = buf.readUInt32LE(ref.value);
      ref.value += 4;
    } else if (type === 2) {
      obj[key] = deserializeJson(buf, ref);
    }
  }

  return obj;
}
