import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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

      // 1. 基于文件真实内容计算 SHA-256 哈希指纹
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const ext = path.extname(file.name) || '.bin';
      
      // 使用文件哈希作为唯一文件名（例如: a8f9c2...d7.pdf）
      const hashFilename = `${fileHash}${ext}`;
      const filePath = path.join(uploadDir, hashFilename);

      // 2. 检查该文件是否已在服务器磁盘存在
      if (!fs.existsSync(filePath)) {
        // 第一次上传：写入磁盘
        await fs.promises.writeFile(filePath, buffer);
      }
      // 如果已存在：直接复用已有物理文件，零额外磁盘开销！

      results.push({
        id: nanoid(10),
        name: file.name,
        url: `/uploads/${hashFilename}`,
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
