import type { ConsumerName, ConsumerRegistry } from "./consumer-registry.js";

export interface WorkerComponent {
  readonly name: string;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

export type WorkerAdapterMode = "injected" | "local-synthetic";

type WorkerState = "idle" | "running" | "starting" | "stopping";

export class WorkerRuntime {
  readonly adapterMode: WorkerAdapterMode;
  readonly #components: readonly WorkerComponent[];
  readonly #consumer: ConsumerName;
  readonly #registry: ConsumerRegistry;
  #keepAlive: ReturnType<typeof setInterval> | undefined;
  #release: (() => void) | undefined;
  #state: WorkerState = "idle";
  readonly #startedComponents: WorkerComponent[] = [];
  #transition: Promise<void> = Promise.resolve();

  #enqueue(transition: () => Promise<void>): Promise<void> {
    const result = this.#transition.then(transition);
    this.#transition = result.catch(() => undefined);
    return result;
  }

  async #stopStartedComponents(): Promise<readonly unknown[]> {
    const errors: unknown[] = [];
    for (const component of this.#startedComponents.toReversed()) {
      try {
        await component.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#startedComponents.length = 0;
    return errors;
  }

  constructor(
    consumer: ConsumerName,
    registry: ConsumerRegistry,
    components: readonly WorkerComponent[] = [],
    adapterMode: WorkerAdapterMode = "injected",
  ) {
    this.adapterMode = adapterMode;
    this.#components = components;
    this.#consumer = consumer;
    this.#registry = registry;
  }

  componentNames(): readonly string[] {
    return this.#components.map((component) => component.name);
  }

  async #startTransition(): Promise<void> {
    if (this.#state === "running") {
      return;
    }

    this.#state = "starting";
    try {
      this.#release = this.#registry.acquire(this.#consumer);
      for (const component of this.#components) {
        this.#startedComponents.push(component);
        await component.start();
      }
    } catch (error) {
      const cleanupErrors = await this.#stopStartedComponents();
      this.#release?.();
      this.#release = undefined;
      this.#state = "idle";
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "Worker failed to start and roll back",
          { cause: error },
        );
      }
      throw error;
    }
    this.#keepAlive = setInterval(() => undefined, 60_000);
    this.#state = "running";
  }

  async #stopTransition(): Promise<void> {
    if (this.#state === "idle") {
      return;
    }

    this.#state = "stopping";
    if (this.#keepAlive !== undefined) {
      clearInterval(this.#keepAlive);
      this.#keepAlive = undefined;
    }

    const errors = await this.#stopStartedComponents();
    this.#release?.();
    this.#release = undefined;
    this.#state = "idle";
    if (errors.length > 0) {
      throw new AggregateError(errors, "Worker components failed to stop");
    }
  }

  start(): Promise<void> {
    return this.#enqueue(async () => await this.#startTransition());
  }

  stop(): Promise<void> {
    return this.#enqueue(async () => await this.#stopTransition());
  }
}
