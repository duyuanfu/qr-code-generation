import fs from 'fs';
import path from 'path';

export interface DynamicQRItem {
  id: string;
  shortCode: string;
  contentType: 'image' | 'video' | 'file';
  title: string;
  description?: string;
  mediaUrls: string; // JSON array string
  styleConfig?: string;
  createdAt: string | Date;
}

export interface ScanLogItem {
  id: string;
  qrId: string;
  scannedAt: string | Date;
  ip?: string;
  userAgent?: string;
  device?: string;
}

interface DBStorage {
  dynamicQrs: DynamicQRItem[];
  scanLogs: ScanLogItem[];
}

export const dynamicQrs = {
  _table: 'dynamicQrs',
  id: 'id',
  shortCode: 'shortCode',
  contentType: 'contentType',
  title: 'title',
  description: 'description',
  mediaUrls: 'mediaUrls',
  styleConfig: 'styleConfig',
  createdAt: 'createdAt',
} as const;

export const scanLogs = {
  _table: 'scanLogs',
  id: 'id',
  qrId: 'qrId',
  scannedAt: 'scannedAt',
  ip: 'ip',
  userAgent: 'userAgent',
  device: 'device',
} as const;

export function eq(field: any, value: any) {
  // If field is a string key
  const fieldKey = typeof field === 'string' ? field : field?.name || field?.shortCode || 'shortCode';
  return { field: fieldKey, value };
}

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
const dbFilePath = path.join(dataDir, 'db.json');

function readStorage(): DBStorage {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(dbFilePath)) {
      const initial: DBStorage = { dynamicQrs: [], scanLogs: [] };
      fs.writeFileSync(dbFilePath, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const content = fs.readFileSync(dbFilePath, 'utf-8');
    return JSON.parse(content) || { dynamicQrs: [], scanLogs: [] };
  } catch (err) {
    console.error('Failed to read db.json:', err);
    return { dynamicQrs: [], scanLogs: [] };
  }
}

function writeStorage(data: DBStorage) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write db.json:', err);
  }
}

export const db = {
  select: () => ({
    from: <T = DynamicQRItem>(tableDef: any) => {
      const tableName = (tableDef?._table || 'dynamicQrs') as keyof DBStorage;
      const storage = readStorage();
      const rows = (storage[tableName] || []) as T[];

      return {
        all: (): T[] => rows,
        where: (condition: any) => {
          let val = condition?.value;
          // In case of Drizzle SQL object fallback
          if (!val && condition?.queryChunks) {
            const paramChunk = condition.queryChunks.find((c: any) => c?.value !== undefined);
            val = paramChunk?.value;
          }

          const matched = rows.filter((r: any) => {
            if (val !== undefined) {
              return r.shortCode === val || r.id === val;
            }
            return true;
          });

          return {
            get: (): T | undefined => matched[0] || undefined,
            all: (): T[] => matched,
          };
        },
      };
    },
  }),

  insert: (tableDef: any) => ({
    values: (record: any) => ({
      run: () => {
        const tableName = (tableDef?._table || 'dynamicQrs') as keyof DBStorage;
        const storage = readStorage();
        if (!storage[tableName]) {
          (storage as any)[tableName] = [];
        }
        (storage[tableName] as any[]).push(record);
        writeStorage(storage);
        return { changes: 1 };
      },
    }),
  }),
};
