export type MessageHandler = (
  message: Buffer | string | number | object
) => void;
