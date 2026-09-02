export type SignedUploadRequest = { projectId: string; key: string; contentType: string; checksum: string; sizeBytes: number };
export type StoredObjectMetadata = { key: string; bucket: string; contentType?: string; checksum?: string; sizeBytes?: number };

export interface ObjectStorageAdapter {
  readonly kind: "disabled" | "s3-compatible";
  createSignedUpload(request: SignedUploadRequest): Promise<{ url: string; storageKey: string }>;
  createSignedDownload(projectId: string, key: string): Promise<{ url: string }>;
  delete(projectId: string, key: string): Promise<void>;
  metadata(projectId: string, key: string): Promise<StoredObjectMetadata>;
}
