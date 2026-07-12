import type { Database, DbClient } from './index';

export interface IUnitOfWorkContextBuilder<TContext> {
  build(tx: DbClient): TContext;
}

export interface IUnitOfWork<TContext> {
  run<T>(fn: (ctx: TContext) => Promise<T>): Promise<T>;
}

export class UnitOfWork<TContext> implements IUnitOfWork<TContext> {
  constructor(
    private readonly db: Database,
    private readonly contextBuilder: IUnitOfWorkContextBuilder<TContext>,
  ) {}

  async run<T>(fn: (ctx: TContext) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(this.contextBuilder.build(tx)));
  }
}
