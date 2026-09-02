import { validateServiceEnvironment, type ServiceRole } from "../lib/env";

const role = process.argv[2] as ServiceRole;
if (!(["web", "worker", "scheduler"] as string[]).includes(role)) throw new Error("Expected service role: web, worker or scheduler.");
validateServiceEnvironment(role);
process.stdout.write(`Environment validated for ${role}.\n`);
