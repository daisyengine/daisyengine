import { NumberRef } from '../number-ref';

export function serializeUInt32(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeUInt32LE(value, ref.value);
  ref.value += 4;
}

export function deserializeUInt32(buf: Buffer, ref: NumberRef) {
  const val = buf.readUInt32LE(ref.value);
  ref.value += 4;
  return val;
}
