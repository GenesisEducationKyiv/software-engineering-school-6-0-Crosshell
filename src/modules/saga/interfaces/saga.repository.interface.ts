import type {
  CreateSagaInstanceData,
  SagaInstance,
  SagaStatus,
} from '../saga.types';

export interface ISagaRepository {
  create(data: CreateSagaInstanceData): Promise<void>;
  updateStatus(correlationId: string, status: SagaStatus): Promise<void>;
  findByStatus(status: SagaStatus): Promise<SagaInstance[]>;
  findByCorrelationId(correlationId: string): Promise<SagaInstance | null>;
  updateStatusIfCurrent(
    correlationId: string,
    status: SagaStatus,
    expectedStatuses: SagaStatus[],
  ): Promise<boolean>;
}
