import type { ConsumerName, ConsumerRegistry } from "./consumer-registry.js";

export class WorkerRuntime {
  readonly #consumer: ConsumerName;
  readonly #registry: ConsumerRegistry;
  #keepAlive: ReturnType<typeof setInterval> | undefined;
  #release: (() => void) | undefined;

  constructor(consumer: ConsumerName, registry: ConsumerRegistry) {
    this.#consumer = consumer;
    this.#registry = registry;
  }

  async start(): Promise<void> {
    if (this.#release !== undefined) {
      return;
    }

    this.#release = this.#registry.acquire(this.#consumer);
    this.#keepAlive = setInterval(() => undefined, 60_000);
  }

  async stop(): Promise<void> {
    if (this.#keepAlive !== undefined) {
      clearInterval(this.#keepAlive);
      this.#keepAlive = undefined;
    }

    this.#release?.();
    this.#release = undefined;
  }
}
