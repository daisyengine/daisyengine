import { NumberRef } from '../number-ref';

export function serializeString(value: string, buf: Buffer, ref: NumberRef) {
  buf.writeUInt16LE(value.length, ref.value);
  ref.value += 2;

  for (let charIndex = 0; charIndex < value.length; charIndex++) {
    const char = value.charCodeAt(charIndex);
    buf.writeUInt16LE(char, ref.value);
    ref.value += 2;
  }
}

export function deserializeString(buf: Buffer, ref: NumberRef) {
  let charcodes: number[] = [];

  const length = buf.readUInt16LE(ref.value);
  ref.value += 2;

  for (let i = 0; i < length; i++) {
    charcodes.push(buf.readUInt16LE(ref.value));
    ref.value += 2;
  }

  return String.fromCharCode(...charcodes);
}
