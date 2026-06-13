import type { Request, Response } from 'express';
import { z } from 'zod';
import * as uploadService from './upload.service.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import logger from '../../utils/logger.util.js';

const uploadTypeSchema = z
    .enum(['avatar', 'logo', 'attachment'])
    .optional()
    .default('avatar');

export const upload = asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        ResponseHandler.error(
            res,
            'No file provided or unsupported file type.',
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST,
            'POST /api/uploads'
        );
        return;
    }

    const typeResult = uploadTypeSchema.safeParse(req.body.type);
    if (!typeResult.success) {
        ResponseHandler.error(
            res,
            'Invalid upload type. Must be "avatar", "logo", or "attachment"',
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST,
            'POST /api/uploads'
        );
        return;
    }

    try {
        const { url, publicId } = await uploadService.uploadFile(
            req.file,
            typeResult.data
        );

        ResponseHandler.success(
            res,
            'File uploaded successfully',
            HttpStatus.OK,
            { url, publicId }
        );
    } catch (err) {
        logger.error({ err }, 'Cloudinary upload failed');
        ResponseHandler.error(
            res,
            'Failed to upload file',
            ErrorCode.SERVER_ERROR,
            HttpStatus.INTERNAL_SERVER_ERROR,
            'POST /api/uploads'
        );
    }
});
