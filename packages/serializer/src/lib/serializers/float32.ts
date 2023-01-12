import { NumberRef } from '../number-ref';

export function serializeFloat32(value: number, buf: Buffer, ref: NumberRef) {
  buf.writeFloatLE(value, ref.value);
  ref.value += 4;
}

export function deserializeFloat32(buf: Buffer, ref: NumberRef) {
  const val = buf.readFloatLE(ref.value);
  ref.value += 4;
  return val;
}
