import { disabledStorage } from "./disabled";
import { createS3CompatibleStorage } from "./s3-compatible";

export function getObjectStorage() {
  return process.env.OBJECT_STORAGE_ENABLED === "true" ? createS3CompatibleStorage() : disabledStorage;
}
