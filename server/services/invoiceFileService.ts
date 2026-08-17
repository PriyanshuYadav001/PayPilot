import { supabaseServer } from '../lib/supabaseClient';
import { logger } from '../utils/logger';
import { getInvoice } from './invoiceService';
import { MAX_FILE_SIZE } from '../middleware/upload';

const BUCKET = 'invoices-private';
const SIGNED_URL_EXPIRY_SECONDS = 900;

export class InvoiceFileError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'InvoiceFileError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface InvoiceFileInput {
  buffer: Buffer;
  originalName: string;
  contentType: string;
  size: number;
}

export interface InvoiceFileResult {
  path: string;
  fileName: string;
  size: number;
  contentType: string;
}

export interface InvoiceFileSignedResult {
  signedUrl: string;
  fileName: string;
  expiresIn: number;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) {
    return '';
  }
  return filename.slice(dot + 1).toLowerCase();
}

function filePath(organizationId: string, invoiceId: string, ext: string): string {
  return `${organizationId}/invoices/${invoiceId}/file.${ext}`;
}

function fileNameFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Returns the first stored file for the invoice folder, or null. The stored
 * name is normalized (secure, server-controlled), never derived from the
 * client's original filename.
 */
async function existingFile(
  organizationId: string,
  invoiceId: string
): Promise<{ path: string; name: string; ext: string } | null> {
  const folder = `${organizationId}/invoices/${invoiceId}`;
  const { data, error } = await supabaseServer.storage.from(BUCKET).list(folder, { limit: 10 });

  if (error) {
    logger.error('existingFile: list failed', error.message);
    throw new InvoiceFileError('Failed to list invoice file.', 'FILE_LIST_FAILED', 500);
  }

  const rows = (data ?? []) as Array<{ name: string; metadata?: unknown }>;
  const file = rows.find(
    (row) => typeof row.name === 'string' && !row.name.endsWith('/') && row.metadata != null
  );

  if (!file) {
    return null;
  }

  return {
    path: `${folder}/${file.name}`,
    name: file.name,
    ext: getExtension(file.name),
  };
}

export async function uploadInvoiceFile(
  organizationId: string,
  invoiceId: string,
  file: InvoiceFileInput
): Promise<InvoiceFileResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new InvoiceFileError('File too large.', 'FILE_TOO_LARGE', 413);
  }

  // Tenant-scoped ownership check (IDOR protection) before any storage write.
  const invoice = await getInvoice(organizationId, invoiceId);
  if (!invoice) {
    throw new InvoiceFileError('Invoice not found.', 'NOT_FOUND', 404);
  }

  const ext = getExtension(file.originalName);
  const path = filePath(organizationId, invoiceId, ext);

  const existing = await existingFile(organizationId, invoiceId);
  if (existing && existing.path !== path) {
    const { error: removeError } = await supabaseServer.storage.from(BUCKET).remove([existing.path]);
    if (removeError) {
      logger.error('uploadInvoiceFile: removing stale file failed', removeError.message);
    }
  }

  const { error } = await supabaseServer.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.contentType,
    cacheControl: '3600',
    upsert: true,
  });

  if (error) {
    logger.error('uploadInvoiceFile: upload failed', error.message);
    throw new InvoiceFileError('Failed to upload invoice file.', 'FILE_UPLOAD_FAILED', 500);
  }

  return {
    path,
    fileName: fileNameFromPath(path),
    size: file.size,
    contentType: file.contentType,
  };
}

export async function getInvoiceFileSignedUrl(
  organizationId: string,
  invoiceId: string
): Promise<InvoiceFileSignedResult> {
  const invoice = await getInvoice(organizationId, invoiceId);
  if (!invoice) {
    throw new InvoiceFileError('Invoice not found.', 'NOT_FOUND', 404);
  }

  const existing = await existingFile(organizationId, invoiceId);
  if (!existing) {
    throw new InvoiceFileError('No file uploaded for this invoice.', 'FILE_NOT_FOUND', 404);
  }

  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUrl(existing.path, SIGNED_URL_EXPIRY_SECONDS, { download: existing.name });

  if (error || !data?.signedUrl) {
    logger.error('getInvoiceFileSignedUrl: createSignedUrl failed', error?.message);
    throw new InvoiceFileError('Failed to create signed URL.', 'FILE_SIGNED_URL_FAILED', 500);
  }

  return {
    signedUrl: data.signedUrl,
    fileName: existing.name,
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
  };
}

export const invoiceFileService = {
  uploadInvoiceFile,
  getInvoiceFileSignedUrl,
};
