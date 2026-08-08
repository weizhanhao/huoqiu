export type ConsumerName = "events" | "market";

export class DuplicateConsumerRegistrationError extends Error {
  override readonly name = "DuplicateConsumerRegistrationError";
}

export class ConsumerRegistry {
  readonly #active = new Set<ConsumerName>();
  #registrationAttempts = 0;

  acquire(consumer: ConsumerName): () => void {
    this.#registrationAttempts += 1;
    if (this.#active.has(consumer)) {
      throw new DuplicateConsumerRegistrationError(
        `Consumer ${consumer} is already registered`,
      );
    }

    this.#active.add(consumer);
    let released = false;

    return () => {
      if (released) {
        return;
      }

      released = true;
      this.#active.delete(consumer);
    };
  }

  activeConsumers(): readonly ConsumerName[] {
    return [...this.#active].toSorted();
  }

  registrationAttempts(): number {
    return this.#registrationAttempts;
  }
}

export const processConsumerRegistry = new ConsumerRegistry();
