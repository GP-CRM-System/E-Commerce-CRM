import { uploadToCloudinary } from '../../utils/cloudinary.util.js';

export async function uploadFile(
    file: { buffer: Buffer; mimetype: string; size: number },
    type: 'avatar' | 'logo'
): Promise<{ url: string; publicId: string }> {
    const folder = type === 'logo' ? 'logos' : 'avatars';
    return uploadToCloudinary(file.buffer, folder);
}
