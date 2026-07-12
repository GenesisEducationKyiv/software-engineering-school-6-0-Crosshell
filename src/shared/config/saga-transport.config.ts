import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_SAGA_GRPC_URL = 'localhost:50052';
const DEFAULT_SAGA_GRPC_DEADLINE_MS = 10_000;

export const sagaTransportConfig = registerConfig(
  z
    .object({
      SAGA_MAIL_TRANSPORT: z.enum(['queue', 'grpc']).default('queue'),
      SAGA_GRPC_URL: z.string().default(DEFAULT_SAGA_GRPC_URL),
      SAGA_GRPC_DEADLINE_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(DEFAULT_SAGA_GRPC_DEADLINE_MS),
    })
    .transform((env) => ({
      transport: env.SAGA_MAIL_TRANSPORT,
      grpcUrl: env.SAGA_GRPC_URL,
      grpcDeadlineMs: env.SAGA_GRPC_DEADLINE_MS,
    })),
);
