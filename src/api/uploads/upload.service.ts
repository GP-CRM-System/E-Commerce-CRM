import { uploadToCloudinary } from '../../utils/cloudinary.util.js';
import { uploadToB2, isB2Configured, b2Config } from '../../config/b2.config.js';
import crypto from 'crypto';

export async function uploadFile(
    file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
    type: 'avatar' | 'logo' | 'attachment'
): Promise<{ url: string; publicId: string }> {
    if (type === 'attachment' && isB2Configured) {
        const fileExtension = file.originalname ? file.originalname.split('.').pop() || '' : '';
        const uniqueId = crypto.randomUUID();
        const key = `attachments/${uniqueId}${fileExtension ? `.${fileExtension}` : ''}`;
        
        const result = await uploadToB2(key, file.buffer, file.mimetype);
        if (result.success) {
            const url = `https://${b2Config.bucket}.s3.${b2Config.region}.backblazeb2.com/${key}`;
            return { url, publicId: key };
        } else {
            throw new Error(`B2 upload failed: ${result.error}`);
        }
    }

    const folder = type === 'logo' ? 'logos' : type === 'attachment' ? 'attachments' : 'avatars';
    const resourceType = type === 'attachment' ? 'auto' : 'image';
    return uploadToCloudinary(file.buffer, folder, resourceType);
}
