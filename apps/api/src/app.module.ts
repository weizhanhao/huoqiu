import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";

@Module({ controllers: [HealthController], imports: [IdentityModule] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest modules carry runtime decorator metadata.
export class AppModule {}
