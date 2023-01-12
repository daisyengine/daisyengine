import { NumberRef } from '../number-ref';

export function serializeInt16(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeInt16LE(value, ref.value);
  ref.value += 2;
}

export function deserializeInt16(buf: Buffer, ref: NumberRef) {
  const val = buf.readInt16LE(ref.value);
  ref.value += 2;
  return val;
}
