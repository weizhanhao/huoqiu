export interface DeadLetterEvent {
  readonly event_id: string;
}

export type DeadLetterEntry<Event extends DeadLetterEvent> = Readonly<{
  attempts: number;
  consumer: string;
  event: Event;
  lastError: string;
}>;

export interface DlqStorePort<Event extends DeadLetterEvent> {
  get(
    consumer: string,
    eventId: string,
  ): Promise<DeadLetterEntry<Event> | undefined>;
  list(consumer?: string): Promise<readonly DeadLetterEntry<Event>[]>;
  put(entry: DeadLetterEntry<Event>): Promise<void>;
  remove(consumer: string, eventId: string): Promise<boolean>;
}

const entryKey = (consumer: string, eventId: string): string =>
  JSON.stringify([consumer, eventId]);

export class InMemoryDlqStore<
  Event extends DeadLetterEvent,
> implements DlqStorePort<Event> {
  readonly #entries = new Map<string, DeadLetterEntry<Event>>();

  async get(
    consumer: string,
    eventId: string,
  ): Promise<DeadLetterEntry<Event> | undefined> {
    return this.#entries.get(entryKey(consumer, eventId));
  }

  async list(consumer?: string): Promise<readonly DeadLetterEntry<Event>[]> {
    const entries = [...this.#entries.values()];
    return consumer === undefined
      ? entries
      : entries.filter((entry) => entry.consumer === consumer);
  }

  async put(entry: DeadLetterEntry<Event>): Promise<void> {
    this.#entries.set(
      entryKey(entry.consumer, entry.event.event_id),
      entry,
    );
  }

  async remove(consumer: string, eventId: string): Promise<boolean> {
    return this.#entries.delete(entryKey(consumer, eventId));
  }
}
