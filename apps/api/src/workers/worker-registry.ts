import type { ConsumerName, ConsumerRegistry } from "./consumer-registry.js";
import { OutboxDispatcher } from "./outbox-dispatcher.js";
import {
  type WorkerComponent,
  type WorkerAdapterMode,
  WorkerRuntime,
} from "./worker-runtime.js";

export const processRegistrations = {
  http: {
    process: "http",
    responsibilities: ["http-api"],
  },
  events: {
    process: "events",
    responsibilities: ["inbox-consumer", "outbox-dispatcher"],
  },
  market: {
    process: "market",
    responsibilities: ["synthetic-market-ingest"],
  },
} as const;

export type WorkerResponsibility =
  (typeof processRegistrations)[ConsumerName]["responsibilities"][number];

export type WorkerComponentName =
  | "telemetry"
  | "database"
  | "queue"
  | WorkerResponsibility;

export type WorkerComponentOverrides = Readonly<
  Partial<Record<WorkerComponentName, WorkerComponent>>
>;

const commonComponentNames = ["telemetry", "database", "queue"] as const;

export const defaultWorkerAdapterMode = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): WorkerAdapterMode => {
  const nodeEnvironment = environment.NODE_ENV;
  if (
    nodeEnvironment !== undefined &&
    nodeEnvironment !== "development" &&
    nodeEnvironment !== "test" &&
    nodeEnvironment !== "production"
  ) {
    throw new Error(`Unsupported NODE_ENV: ${nodeEnvironment}`);
  }

  switch (environment.APP_ENV) {
    case "local":
    case "test":
      return "local-synthetic";
    case "production":
    case "staging":
      return "injected";
    case undefined:
      return nodeEnvironment === "production"
        ? "injected"
        : "local-synthetic";
    default:
      throw new Error(`Unsupported APP_ENV: ${environment.APP_ENV}`);
  }
};

class LocalSyntheticComponent implements WorkerComponent {
  readonly name: WorkerComponentName;

  constructor(name: WorkerComponentName) {
    this.name = name;
  }

  start(): void {
    return undefined;
  }

  stop(): void {
    return undefined;
  }
}

const localSyntheticComponents = (
  process: ConsumerName,
  overrides: WorkerComponentOverrides,
): readonly WorkerComponent[] =>
  processRegistrations[process].responsibilities.map((name) => {
    const override = overrides[name];
    if (override !== undefined) return override;
    if (name === "outbox-dispatcher") {
      return new OutboxDispatcher({
        start: () => undefined,
        stop: () => undefined,
      });
    }
    return new LocalSyntheticComponent(name);
  });

export const createRegisteredWorker = (
  process: ConsumerName,
  registry: ConsumerRegistry,
  overrides: WorkerComponentOverrides = {},
  adapterMode: WorkerAdapterMode = defaultWorkerAdapterMode(),
): WorkerRuntime => {
  if (adapterMode === "local-synthetic") {
    return new WorkerRuntime(
      process,
      registry,
      localSyntheticComponents(process, overrides),
      adapterMode,
    );
  }

  const componentNames: readonly WorkerComponentName[] = [
    ...commonComponentNames,
    ...processRegistrations[process].responsibilities,
  ];
  const missing = componentNames.filter((name) => overrides[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing injected worker components: ${missing.join(", ")}`);
  }
  const components = componentNames.map((name) => {
    const component = overrides[name];
    if (component === undefined) {
      throw new Error(`Missing injected worker component: ${name}`);
    }
    return component;
  });

  return new WorkerRuntime(
    process,
    registry,
    components,
    adapterMode,
  );
};
