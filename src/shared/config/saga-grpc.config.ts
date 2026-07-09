import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_SAGA_GRPC_PORT = 50052;

export const sagaGrpcConfig = registerConfig(
  z
    .object({
      SAGA_GRPC_PORT: z.coerce.number().int().positive().optional(),
    })
    .transform((env) => ({
      port: env.SAGA_GRPC_PORT ?? DEFAULT_SAGA_GRPC_PORT,
    })),
);
