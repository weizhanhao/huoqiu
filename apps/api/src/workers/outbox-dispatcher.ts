export interface AtomicBusinessOutboxTransaction<Event> {
  appendOutbox(event: Event): Promise<void> | void;
}

export interface AtomicBusinessOutboxPort<
  Transaction extends AtomicBusinessOutboxTransaction<Event>,
  Event,
> {
  transaction<Result>(
    work: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result>;
}

export type BusinessWithOutboxOptions<
  Transaction extends AtomicBusinessOutboxTransaction<Event>,
  Event,
  Result,
> = Readonly<{
  atomic: AtomicBusinessOutboxPort<Transaction, Event>;
  business: (transaction: Transaction) => Promise<Result> | Result;
  createEvent: (
    transaction: Transaction,
    businessResult: Result,
  ) => Promise<Event> | Event;
}>;

export interface OutboxDispatchLoopPort {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export class OutboxDispatcher {
  readonly name = "outbox-dispatcher";
  readonly #loop: OutboxDispatchLoopPort;

  constructor(loop: OutboxDispatchLoopPort) {
    this.#loop = loop;
  }

  async start(): Promise<void> {
    await this.#loop.start();
  }

  async stop(): Promise<void> {
    await this.#loop.stop();
  }
}

export const executeBusinessWithOutbox = async <
  Transaction extends AtomicBusinessOutboxTransaction<Event>,
  Event,
  Result,
>(
  options: BusinessWithOutboxOptions<Transaction, Event, Result>,
): Promise<Result> =>
  await options.atomic.transaction(async (transaction) => {
    const result = await options.business(transaction);
    const event = await options.createEvent(transaction, result);
    await transaction.appendOutbox(event);
    return result;
  });
