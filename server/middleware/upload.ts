import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) {
    return '';
  }

  return filename.slice(dot + 1).toLowerCase();
}

export class FileUploadError extends Error {
  code: string;

  constructor(message: string, code = 'INVALID_FILE_TYPE') {
    super(message);
    this.name = 'FileUploadError';
    this.code = code;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },

  fileFilter: (_req, file, cb) => {
    const ext = getExtension(file.originalname);
    const expectedMime = ALLOWED_TYPES[ext];

    if (!expectedMime) {
      cb(
        new FileUploadError(
          'Unsupported file extension. Allowed: pdf, png, jpg, jpeg.'
        )
      );
      return;
    }

    if (file.mimetype !== expectedMime) {
      cb(
        new FileUploadError(
          'Unsupported file type. Allowed: PDF, PNG, JPG, JPEG.'
        )
      );
      return;
    }

    cb(null, true);
  },
});

export function uploadInvoiceDocument(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof FileUploadError) {
      sendError(res, err.message, err.code, 400);
      return;
    }

    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        sendError(
          res,
          `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
          'FILE_TOO_LARGE',
          413
        );
        return;
      }

      sendError(
        res,
        `Upload failed: ${err.message}`,
        'INVALID_UPLOAD',
        400
      );
      return;
    }

    logger.error('uploadInvoiceDocument: unexpected error', err);

    sendError(
      res,
      'Upload failed.',
      'INTERNAL_SERVER_ERROR',
      500
    );
  });
}
