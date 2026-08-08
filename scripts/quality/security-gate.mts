import { isMainModule, runCli } from "./cli.mts";
import { main as failNotImplemented } from "./not-implemented-gate.mts";

export const main = async (args = process.argv.slice(2)): Promise<void> =>
  await failNotImplemented(args, "security");

if (isMainModule(import.meta.url)) await runCli(main);
