import * as grpc from '@grpc/grpc-js';
import { logger } from '@/shared/logger';

export class GrpcServer {
  private readonly server: grpc.Server;

  constructor() {
    this.server = new grpc.Server();
  }

  addService(
    definition: grpc.ServiceDefinition,
    implementation: grpc.UntypedServiceImplementation,
  ): void {
    this.server.addService(definition, implementation);
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (err, boundPort) => {
          if (err) {
            return reject(err);
          }
          logger.info(`[gRPC] Server listening on port ${boundPort}`);
          resolve();
        },
      );
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.tryShutdown((err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }
}
