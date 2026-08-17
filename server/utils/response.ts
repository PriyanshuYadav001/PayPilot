import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, pagination?: Record<string, unknown>): void {
  res.status(statusCode).json({
    success: true,
    data,
    ...(pagination ? { pagination } : {}),
  });
}

export function sendError(res: Response, message: string, code = 'BAD_REQUEST', statusCode = 400, details?: unknown[]): void {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}
