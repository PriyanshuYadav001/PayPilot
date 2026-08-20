import type { Json } from '../../types/database.types';

export function toJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJson);
  }

  if (typeof value === 'object') {
    const object: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        object[key] = toJson(entry);
      }
    }
    return object;
  }

  return String(value);
}
