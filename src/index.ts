import Uppy, { UppyFile } from '@uppy/core';
import { Upload } from 'tus-js-client';
import { apiRequest } from './apiRequest';

/**
 * Hook to use the hypermedia uploader.
 *
 * @param endpoint - The endpoint URL for the upload.
 * @param options - Options including callbacks for upload events.
 * @returns An instance of the Uppy uploader.
 */
export const useHypermediaUploader = (
  endpoint: string,
  options: HypermediaUploaderOptions,
): Uppy => {
  const {
    onError,
    onProgress,
    onSuccess,
    autoProceed = true,
    allowMultipleUploadBatches = true,
    debug,
    maxFileSize,
    minFileSize,
    maxTotalFileSize,
    minNumberOfFiles = 1,
    maxNumberOfFiles = 1,
  } = options;

  const uploader = new Uppy({
    autoProceed, // set to false to let the user start the upload
    allowMultipleUploadBatches, // set to true to allow multiple upload batches per URL
    debug, // set to true to show debug messages (recommended in development)
    restrictions: {
      maxFileSize, // or specify a size limit
      minFileSize, // or specify a minimum size
      maxTotalFileSize, // or specify a total size limit
      maxNumberOfFiles,
      minNumberOfFiles,
      allowedFileTypes: ['video/*'],
    },
    infoTimeout: 10000,
  });

  uploader.on('file-added', async (file: UppyFile) => {
    // Get the upload information from the Hypermedia Server Uploader.
    const uploadInformation = await apiRequest(endpoint, 'POST', {
      title: file.name,
      size: file.size,
    });

    if (uploadInformation.ok) {
      const information = await uploadInformation.json();

      if (information.success) {
        const { data } = information;

        // Create a new tus upload.
        const tus = new Upload(file.data, {
          endpoint: data.endpoint,
          retryDelays: [0, 3000, 5000, 10000],
          removeFingerprintOnSuccess: true,
          chunkSize: 3 * 1024 * 1024,
          headers: data.headers,
          metadata: {
            filetype: file.data.type,
            collection: data.collection,
            title: file.name,
          },
          onError: (error: Error) => {
            console.error(error);

            if (onError) {
              onError(error);
            }
          },
          onProgress: (bytesUploaded: number, bytesTotal: number) => {
            const progress = (bytesUploaded / bytesTotal) * 100;
            if (onProgress) {
              onProgress(progress, bytesUploaded, bytesTotal);
            }
          },
          onSuccess: () => {
            if (onSuccess) {
              onSuccess(tus);
            }
          },
        });

        tus.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length) {
            tus.resumeFromPreviousUpload(previousUploads[0]);
          }

          tus.start();
        });
      } else {
        console.error('ERROR:', information);
        throw new Error('Something went wrong before start uploading');
      }
    } else {
      console.error('ERROR:', uploadInformation);
      throw new Error('Something went wrong getting upload information');
    }
  });

  return uploader;
};

interface HypermediaUploaderOptions {
  maxFileSize?: number;
  minFileSize?: number;
  maxTotalFileSize?: number;
  maxNumberOfFiles?: number;
  minNumberOfFiles?: number;
  allowedFileTypes?: string[];
  allowMultipleUploadBatches?: boolean;
  autoProceed?: boolean;
  debug?: boolean;
  onError?: (error: Error) => void;
  onProgress?: (
    progress: number,
    bytesUploaded: number,
    bytesTotal: number,
  ) => void;
  onSuccess?: (upload: Upload) => void;
}
