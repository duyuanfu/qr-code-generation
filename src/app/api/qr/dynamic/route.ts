import { NextRequest, NextResponse } from 'next/server';
import { db, dynamicQrs } from '@/db';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contentType, title, description, mediaUrls, styleConfig } = body;

    if (!contentType || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = nanoid(12);
    // Short 6-character unique code for compact QR dot density
    const shortCode = nanoid(6);

    const newRecord = {
      id,
      shortCode,
      contentType,
      title,
      description: description || '',
      mediaUrls: JSON.stringify(mediaUrls || []),
      styleConfig: JSON.stringify(styleConfig || {}),
      createdAt: new Date(),
    };

    db.insert(dynamicQrs).values(newRecord).run();

    // Host URL resolution
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const landingUrl = `${protocol}://${host}/q/${shortCode}`;

    return NextResponse.json({
      success: true,
      id,
      shortCode,
      landingUrl,
    });
  } catch (err: any) {
    console.error('Failed to create dynamic QR:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
