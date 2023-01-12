import { NumberRef } from '../number-ref';

export function serializeInt8(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeInt8(value, ref.value);
  ref.value += 1;
}

export function deserializeInt8(buf: Buffer, ref: NumberRef) {
  const val = buf.readInt8(ref.value);
  ref.value += 1;
  return val;
}
