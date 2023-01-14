import { NumberRef } from '../number-ref';

export function serializeBoolean(value: boolean, buf: Buffer, ref: NumberRef) {
  buf.writeUInt8(value ? 1 : 0, ref.value);
  ref.value += 1;
}

export function deserializeBoolean(buf: Buffer, ref: NumberRef) {
  const val = buf.readUInt8(ref.value) === 1;
  ref.value += 1;
  return val;
}
