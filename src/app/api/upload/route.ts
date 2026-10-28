import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const results = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const ext = path.extname(file.name) || '.bin';
      const safeFilename = `${Date.now()}-${nanoid(8)}${ext}`;
      const filePath = path.join(uploadDir, safeFilename);

      await fs.promises.writeFile(filePath, buffer);

      results.push({
        id: nanoid(10),
        name: file.name,
        url: `/uploads/${safeFilename}`,
        size: file.size,
        type: file.type,
      });
    }

    return NextResponse.json({
      success: true,
      files: results,
    });
  } catch (err: any) {
    console.error('File upload failed:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
