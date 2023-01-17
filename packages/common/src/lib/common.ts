export enum ServerProtocol {
  UserPacket = 0,
  RoomInfo = 3,
  ClientId = 4,

  Error = 50,
  CloseReason = 51,

  Ping = 255,
}
export enum ClientProtocol {
  UserPacket = 0,
  JoinRoom = 1,

  Ping = 255,
}
export type NumberRef = {
  value: number;
};
