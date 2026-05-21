export interface ILogger {
  info(msg: string): void;
  info(obj: object, msg: string): void;

  warn(msg: string): void;
  warn(obj: object, msg: string): void;

  error(msg: string): void;
  error(obj: object, msg: string): void;
}
