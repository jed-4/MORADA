import { useState, useCallback } from "react";
import type { UppyFile } from "@uppy/core";

interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: UploadMetadata;
}

interface UseUploadOptions {
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * React hook for handling file uploads with presigned URLs.
 *
 * This hook implements the two-step presigned URL upload flow:
 * 1. Request a presigned URL from your backend (sends JSON metadata, NOT the file)
 * 2. Upload the file directly to the presigned URL
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const { uploadFile, isUploading, error } = useUpload({
 *     onSuccess: (response) => {
 *       console.log("Uploaded to:", response.objectPath);
 *     },
 *   });
 *
 *   const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *     const file = e.target.files?.[0];
 *     if (file) {
 *       await uploadFile(file);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleFileChange} disabled={isUploading} />
 *       {isUploading && <p>Uploading...</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  /**
   * Request a presigned URL from the backend.
   * IMPORTANT: Send JSON metadata, NOT the file itself.
   */
  const requestUploadUrl = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get upload URL");
      }

      return response.json();
    },
    []
  );

  /**
   * Upload a file directly to the presigned URL.
   */
  const uploadToPresignedUrl = useCallback(
    async (file: File, uploadURL: string): Promise<void> => {
      let response: Response;
      try {
        response = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      } catch (networkErr: any) {
        // CORS / DNS / offline / blocked — fetch itself rejects.
        const msg = networkErr?.message
          ? `Network error during upload: ${networkErr.message}`
          : "Network error during upload (possible CORS or connectivity issue)";
        console.error("[useUpload] PUT network failure", networkErr, { uploadURL });
        throw new Error(msg);
      }

      if (!response.ok) {
        // Capture the storage server's response so we can see *why*.
        let bodySnippet = "";
        try {
          bodySnippet = (await response.text()).slice(0, 400);
        } catch {
          /* ignore */
        }
        const detail = `Storage upload failed: ${response.status} ${response.statusText}${
          bodySnippet ? ` — ${bodySnippet}` : ""
        }`;
        console.error("[useUpload] PUT non-OK", {
          status: response.status,
          statusText: response.statusText,
          bodySnippet,
        });
        throw new Error(detail);
      }
    },
    []
  );

  /**
   * Upload a file via the server-side multipart endpoint
   * (`POST /api/uploads/file`). The browser sends the file to our own
   * backend, which streams it into object storage. This avoids the CORS
   * preflight failure that direct-to-GCS uploads hit from the dev origin.
   */
  const uploadViaServer = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const form = new FormData();
      form.append("file", file, file.name);

      let response: Response;
      try {
        response = await fetch("/api/uploads/file", {
          method: "POST",
          body: form,
          credentials: "include",
        });
      } catch (networkErr: any) {
        const msg = networkErr?.message
          ? `Network error during upload: ${networkErr.message}`
          : "Network error during upload";
        console.error("[useUpload] /api/uploads/file network failure", networkErr);
        throw new Error(msg);
      }

      if (!response.ok) {
        let bodySnippet = "";
        try {
          bodySnippet = (await response.text()).slice(0, 400);
        } catch {
          /* ignore */
        }
        throw new Error(
          `Server upload failed: ${response.status} ${response.statusText}${
            bodySnippet ? ` — ${bodySnippet}` : ""
          }`,
        );
      }

      const data = await response.json();
      // Normalise to the same shape as the presigned-URL flow.
      return {
        uploadURL: "", // unused for server-side flow
        objectPath: data.objectPath,
        metadata: {
          name: data.name ?? file.name,
          size: file.size,
          contentType: data.contentType ?? file.type ?? "application/octet-stream",
        },
      };
    },
    [],
  );

  /**
   * Upload a file. Uses the server-side endpoint by default to avoid
   * browser CORS issues with direct GCS uploads. Set
   * `useDirectUpload: true` to fall back to the legacy presigned-URL flow.
   *
   * @param file - The file to upload
   * @param opts - Per-call options
   * @returns The upload response containing the object path
   */
  const uploadFile = useCallback(
    async (
      file: File,
      opts: { useDirectUpload?: boolean } = {},
    ): Promise<UploadResponse | null> => {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        let uploadResponse: UploadResponse;
        if (opts.useDirectUpload) {
          // Legacy: presigned-URL direct-to-GCS (subject to CORS)
          setProgress(10);
          uploadResponse = await requestUploadUrl(file);
          setProgress(30);
          await uploadToPresignedUrl(file, uploadResponse.uploadURL);
        } else {
          // Default: server-side multipart upload (no CORS issues)
          setProgress(10);
          uploadResponse = await uploadViaServer(file);
        }

        setProgress(100);
        options.onSuccess?.(uploadResponse);
        return uploadResponse;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Upload failed");
        setError(error);
        options.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, uploadViaServer, options],
  );

  /**
   * Get upload parameters for Uppy's AWS S3 plugin.
   *
   * IMPORTANT: This function receives the UppyFile object from Uppy.
   * Use file.name, file.size, file.type to request per-file presigned URLs.
   *
   * Use this with the ObjectUploader component:
   * ```tsx
   * <ObjectUploader onGetUploadParameters={getUploadParameters}>
   *   Upload
   * </ObjectUploader>
   * ```
   */
  const getUploadParameters = useCallback(
    async (
      file: UppyFile<Record<string, unknown>, Record<string, unknown>>
    ): Promise<{
      method: "PUT";
      url: string;
      headers?: Record<string, string>;
    }> => {
      // Use the actual file properties to request a per-file presigned URL
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const data = await response.json();
      return {
        method: "PUT",
        url: data.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    },
    []
  );

  return {
    uploadFile,
    getUploadParameters,
    isUploading,
    error,
    progress,
  };
}

