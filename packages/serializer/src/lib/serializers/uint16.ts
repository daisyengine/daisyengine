import { NumberRef } from '../number-ref';

export function serializeUInt16(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeUInt16LE(value, ref.value);
  ref.value += 2;
}

export function deserializeUInt16(buf: Buffer, ref: NumberRef) {
  const val = buf.readUInt16LE(ref.value);
  ref.value += 2;
  return val;
}
