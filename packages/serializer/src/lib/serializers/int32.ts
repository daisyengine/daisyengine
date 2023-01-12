import { NumberRef } from '../number-ref';

export function serializeInt32(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeInt32LE(value, ref.value);
  ref.value += 4;
}

export function deserializeInt32(buf: Buffer, ref: NumberRef) {
  const val = buf.readInt32LE(ref.value);
  ref.value += 4;
  return val;
}
