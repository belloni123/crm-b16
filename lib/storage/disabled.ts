import type { ObjectStorageAdapter } from "./types";

function disabled(): never { throw new Error("OBJECT_STORAGE_DISABLED"); }

export const disabledStorage: ObjectStorageAdapter = {
  kind: "disabled",
  async createSignedUpload() { return disabled(); },
  async createSignedDownload() { return disabled(); },
  async delete() { return disabled(); },
  async metadata() { return disabled(); },
};
