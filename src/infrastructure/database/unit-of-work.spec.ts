import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { UnitOfWork } from './unit-of-work';
import type {
  IUnitOfWorkContextBuilder,
  UnitOfWorkContext,
} from './unit-of-work';
import type { Database } from './index';

type TxClient = Parameters<Parameters<Database['transaction']>[0]>[0];

describe('UnitOfWork', () => {
  let db: ReturnType<typeof mock<Database>>;
  let builder: ReturnType<typeof mock<IUnitOfWorkContextBuilder>>;
  let ctx: ReturnType<typeof mock<UnitOfWorkContext>>;
  let uow: UnitOfWork;
  let fakeTx: TxClient;

  beforeEach(() => {
    fakeTx = {} as TxClient;
    ctx = mock<UnitOfWorkContext>();
    builder = mock<IUnitOfWorkContextBuilder>();
    db = mock<Database>();

    builder.build.mockReturnValue(ctx);
    db.transaction.mockImplementation((fn) => fn(fakeTx));

    uow = new UnitOfWork(db, builder);
  });

  it('should execute the callback inside a transaction', async () => {
    await uow.run(vi.fn().mockResolvedValue(undefined));

    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it('should call contextBuilder.build with the transaction object', async () => {
    await uow.run(vi.fn().mockResolvedValue(undefined));

    expect(builder.build).toHaveBeenCalledWith(fakeTx);
  });

  it('should pass the built context to the callback', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    await uow.run(fn);

    expect(fn).toHaveBeenCalledWith(ctx);
  });

  it('should return the value resolved by the callback', async () => {
    const returnValue = 42;
    const result = await uow.run(() => Promise.resolve(returnValue));

    expect(result).toBe(returnValue);
  });

  it('should propagate errors thrown inside the callback', async () => {
    const err = new Error('tx failed');

    await expect(uow.run(() => Promise.reject(err))).rejects.toThrow(err);
  });
});
