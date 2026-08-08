import { Controller, Get } from "@nestjs/common";

@Controller("healthz")
export class HealthController {
  @Get()
  check(): Readonly<{ status: "ok" }> {
    return { status: "ok" };
  }
}
