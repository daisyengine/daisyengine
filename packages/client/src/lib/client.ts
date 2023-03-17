import { ClientProtocol } from '@daisy-engine/common';
import { Room } from './Room';

export const joinRoom = async (
  addr: string,
  id: string,
  authString = ''
): Promise<Room> => {
  // Create room instance
  var room = new Room();
  // Allocate buffer
  const buf = Buffer.alloc(
    1 + (2 + authString.length * 2) + (2 + id.length * 2)
  );

  let offset = 0;
  // Write packet id
  buf.writeUInt8(ClientProtocol.JoinRoom, offset);
  offset += 1;
  // Write auth string
  buf.writeUInt16LE(authString.length, offset);
  offset += 2;
  buf.write(authString, offset, authString.length * 2, 'utf16le');
  offset += authString.length * 2;

  // Write room id
  buf.writeUInt16LE(id.length, offset);
  offset += 2;
  buf.write(id, offset, id.length * 2, 'utf16le');
  offset += id.length * 2;

  // Wait for connection before returning room
  await room._internalConnect(addr, buf);

  // Return room
  return room;
};
