import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller.js";

@Module({ controllers: [HealthController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest modules carry runtime decorator metadata.
export class AppModule {}
