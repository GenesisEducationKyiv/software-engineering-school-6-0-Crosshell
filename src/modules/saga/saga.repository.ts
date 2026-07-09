import { and, eq, inArray } from 'drizzle-orm';
import type { DbClient } from '@/infrastructure/database';
import { sagaInstancesTable } from '@/infrastructure/database/schema';
import type {
  CreateSagaInstanceData,
  SagaInstance,
  SagaStatus,
  SubscribeSagaPayload,
} from './saga.types';
import type { ISagaRepository } from './interfaces/saga.repository.interface';

export class SagaRepository implements ISagaRepository {
  constructor(private readonly db: DbClient) {}

  async create(data: CreateSagaInstanceData): Promise<void> {
    await this.db.insert(sagaInstancesTable).values(data);
  }

  async updateStatus(correlationId: string, status: SagaStatus): Promise<void> {
    await this.db
      .update(sagaInstancesTable)
      .set({ status })
      .where(eq(sagaInstancesTable.correlationId, correlationId));
  }

  async findByStatus(status: SagaStatus): Promise<SagaInstance[]> {
    const rows = await this.db
      .select()
      .from(sagaInstancesTable)
      .where(eq(sagaInstancesTable.status, status));

    return rows.map((row) => this.toSagaInstance(row));
  }

  async findByCorrelationId(
    correlationId: string,
  ): Promise<SagaInstance | null> {
    const [row] = await this.db
      .select()
      .from(sagaInstancesTable)
      .where(eq(sagaInstancesTable.correlationId, correlationId));

    return row ? this.toSagaInstance(row) : null;
  }

  async updateStatusIfCurrent(
    correlationId: string,
    status: SagaStatus,
    expectedStatuses: SagaStatus[],
  ): Promise<boolean> {
    const rows = await this.db
      .update(sagaInstancesTable)
      .set({ status })
      .where(
        and(
          eq(sagaInstancesTable.correlationId, correlationId),
          inArray(sagaInstancesTable.status, expectedStatuses),
        ),
      )
      .returning({ id: sagaInstancesTable.id });

    return rows.length > 0;
  }

  private toSagaInstance(
    row: typeof sagaInstancesTable.$inferSelect,
  ): SagaInstance {
    return {
      ...row,
      status: row.status as SagaStatus,
      payload: row.payload as SubscribeSagaPayload,
    };
  }
}
