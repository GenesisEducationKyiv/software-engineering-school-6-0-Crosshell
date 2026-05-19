import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { logger } from '@/shared/logger';

const PROTO_OPTIONS: protoLoader.Options = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

export function loadServiceDefinition(
  protoFile: string,
  packageName: string,
  serviceName: string,
): grpc.ServiceDefinition {
  const protoPath = path.join(process.cwd(), 'proto', protoFile);
  const packageDef = protoLoader.loadSync(protoPath, PROTO_OPTIONS);
  const grpcObject = grpc.loadPackageDefinition(packageDef);

  const pkg = grpcObject[packageName] as grpc.GrpcObject;
  const svc = pkg[serviceName] as grpc.ServiceClientConstructor;

  return svc.service;
}

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
