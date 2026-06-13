import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import { env } from '../config/env.config.js';

cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret
});

export async function uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    resourceType: 'image' | 'video' | 'raw' | 'auto' = 'image'
): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `crm/${folder}`,
                resource_type: resourceType,
                ...(resourceType === 'image'
                    ? {
                          transformation: [
                              {
                                  width: 400,
                                  height: 400,
                                  crop: 'limit',
                                  quality: 'auto'
                              }
                          ]
                      }
                    : {})
            },
            (error, result: UploadApiResponse | undefined) => {
                if (error) {
                    reject(
                        new Error(`Cloudinary upload failed: ${error.message}`)
                    );
                } else if (!result) {
                    reject(new Error('Cloudinary upload returned no result'));
                } else {
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id
                    });
                }
            }
        );

        uploadStream.end(buffer);
    });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
}
