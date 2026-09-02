import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { deploymentEnvironment } from "@/lib/env";
import { assertOutboundAllowed } from "@/lib/outbound-policy";
import type { ObjectStorageAdapter, SignedUploadRequest } from "./types";

function clean(part: string) { return part.replace(/[^a-zA-Z0-9._-]/g, "_"); }

export function createS3CompatibleStorage(): ObjectStorageAdapter {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  if (!bucket || !process.env.OBJECT_STORAGE_ENDPOINT || !process.env.OBJECT_STORAGE_ACCESS_KEY || !process.env.OBJECT_STORAGE_SECRET_KEY) {
    throw new Error("Incomplete object storage staging configuration.");
  }
  const client = new S3Client({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    region: process.env.OBJECT_STORAGE_REGION || "auto",
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY, secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY },
  });
  const storageKey = (projectId: string, key: string) => `${clean(deploymentEnvironment())}/${clean(projectId)}/${clean(key)}`;
  return {
    kind: "s3-compatible",
    async createSignedUpload(request: SignedUploadRequest) {
      assertOutboundAllowed("OBJECT_STORAGE", "create-signed-upload");
      const key = storageKey(request.projectId, request.key);
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: request.contentType, ChecksumSHA256: request.checksum, ContentLength: request.sizeBytes });
      return { url: await getSignedUrl(client, command, { expiresIn: 300 }), storageKey: key };
    },
    async createSignedDownload(projectId, key) {
      assertOutboundAllowed("OBJECT_STORAGE", "create-signed-download");
      return { url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: storageKey(projectId, key) }), { expiresIn: 300 }) };
    },
    async delete(projectId, key) { assertOutboundAllowed("OBJECT_STORAGE", "delete"); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey(projectId, key) })); },
    async metadata(projectId, key) {
      assertOutboundAllowed("OBJECT_STORAGE", "metadata");
      const resolved = storageKey(projectId, key);
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: resolved }));
      return { key: resolved, bucket, contentType: result.ContentType, checksum: result.ChecksumSHA256, sizeBytes: result.ContentLength };
    },
  };
}
