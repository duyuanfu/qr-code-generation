import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (list) {
      for (const item of list) {
        if (item.family === 'IPv4' && !item.internal) {
          addresses.push(item.address);
        }
      }
    }
  }

  return NextResponse.json({
    addresses,
    port: process.env.PORT || '3001',
  });
}
