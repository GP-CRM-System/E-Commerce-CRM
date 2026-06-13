import {
    Router,
    type Request,
    type Response,
    type NextFunction
} from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import * as uploadController from './upload.controller.js';
import {
    ErrorCode,
    HttpStatus,
    ResponseHandler
} from '../../utils/response.util.js';

const ALLOWED_MIMES = [
    // Images
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    // Videos
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/3gpp',
    'video/webm',
    // Audio / Voice notes
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/amr',
    'audio/m4a',
    'audio/webm',
    'audio/mp4',
    // Documents
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB Meta attachment limit
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        ResponseHandler.error(
            res,
            'Too many upload requests, please try again later',
            ErrorCode.RATE_LIMIT_EXCEEDED,
            HttpStatus.TOO_MANY_REQUESTS,
            'POST /api/uploads'
        );
    },
    skip: () => process.env.NODE_ENV === 'test'
});

function handleMulterError(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction
): void {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            ResponseHandler.error(
                res,
                'File too large. Maximum size is 25MB',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST,
                'POST /api/uploads'
            );
            return;
        }
        ResponseHandler.error(
            res,
            err.message,
            ErrorCode.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST,
            'POST /api/uploads'
        );
        return;
    }
    if (err) {
        next(err);
    } else {
        next();
    }
}

const router = Router();

router.post(
    '/',
    uploadLimiter,
    (req: Request, res: Response, next: NextFunction) => {
        upload.single('file')(req, res, (err) =>
            handleMulterError(err, req, res, next)
        );
    },
    uploadController.upload
);

export default router;
