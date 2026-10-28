import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType } = await req.json();

    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.AWS_REGION || 'auto';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    const fileExt = filename.split('.').pop() || 'dat';
    const key = `uploads/${Date.now()}-${nanoid(8)}.${fileExt}`;

    // If S3 credentials are provided, generate S3 Presigned URL
    if (bucket && accessKeyId && secretAccessKey) {
      const s3 = new S3Client({
        region,
        endpoint: endpoint || undefined,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle: true,
      });

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      const publicUrl = process.env.S3_PUBLIC_DOMAIN
        ? `${process.env.S3_PUBLIC_DOMAIN}/${key}`
        : `${endpoint}/${bucket}/${key}`;

      return NextResponse.json({
        uploadUrl,
        publicUrl,
        key,
      });
    }

    // Local development fallback: direct URL
    return NextResponse.json({
      uploadUrl: `/api/upload/direct`,
      publicUrl: `/uploads/${key}`,
      key,
    });
  } catch (err: any) {
    console.error('Error generating presigned url:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
