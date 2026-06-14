import { useState, useRef } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, CheckCircle, AlertCircle, FileIcon } from "lucide-react";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes: ["image/*"],
      },
      autoProceed: false,
    }).use(AwsS3, {
      shouldUseMultipart: false,
      getUploadParameters: onGetUploadParameters,
    })
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    setError(null);
    setUploadDone(false);
    uppy.cancelAll();
    files.forEach((file) => {
      try {
        uppy.addFile({ name: file.name, type: file.type, data: file });
      } catch {
        // Ignore duplicate file errors
      }
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uppy.upload();
      if (result.failed.length > 0) {
        setError(`Upload failed: ${result.failed[0].error}`);
      } else {
        setUploadDone(true);
        onComplete?.(result);
        setTimeout(() => {
          handleClose();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setShowModal(false);
    setSelectedFiles([]);
    setError(null);
    setUploadDone(false);
    uppy.cancelAll();
  };

  const maxMB = Math.round(maxFileSize / 1048576);

  return (
    <div>
      <Button
        onClick={() => setShowModal(true)}
        className={buttonClassName}
        data-testid="button-upload-photo"
      >
        {children}
      </Button>

      <Dialog open={showModal} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Upload File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Click-to-select area */}
            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mx-auto h-10 w-10 text-slate-400 mb-3" />
              <p className="text-slate-300 font-medium">Click to select a file</p>
              <p className="text-slate-500 text-sm mt-1">
                Images only · Max {maxMB}MB
              </p>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept="image/*"
                multiple={maxNumberOfFiles > 1}
                onChange={handleFileChange}
              />
            </div>

            {/* Selected files list */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-slate-800 rounded-lg p-3"
                  >
                    <FileIcon className="h-5 w-5 text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    {uploadDone && (
                      <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Success */}
            {uploadDone && (
              <div className="flex items-center gap-2 text-green-400 text-sm bg-green-400/10 rounded-lg p-3">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Upload complete!
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={uploading}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0 || uploading || uploadDone}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
