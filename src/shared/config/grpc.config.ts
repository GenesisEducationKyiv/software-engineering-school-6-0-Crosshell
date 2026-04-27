import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_GRPC_PORT = 50051;

export const grpcConfig = registerConfig(
  z
    .object({
      GRPC_PORT: z.coerce
        .number()
        .int()
        .positive()
        .default(DEFAULT_GRPC_PORT),
    })
    .transform((env) => ({
      port: env.GRPC_PORT,
    })),
);
