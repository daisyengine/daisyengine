import { NumberRef } from '../number-ref';

export function serializeUInt8(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeUInt8(value, ref.value);
  ref.value += 1;
}

export function deserializeUInt8(buf: Buffer, ref: NumberRef) {
  const val = buf.readUInt8(ref.value);
  ref.value += 1;
  return val;
}
