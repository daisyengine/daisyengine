export enum ServerProtocol {
  UserPacket = 0,
  RoomSchemaDefinition = 1,
  RoomState = 2,
  RoomInfo = 3,
  Error = 4,
  CloseReason = 5,

  Ping = 255,
}
export enum ClientProtocol {
  UserPacket = 0,
  JoinRoom = 1,

  Ping = 255,
}
