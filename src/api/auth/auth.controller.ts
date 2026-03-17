import { asyncHandler } from '../../middlewares/error.middleware.js';
import {
    HttpStatus,
    ResponseHandler
} from '../../utils/response.util.js';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';


export const getMe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    ResponseHandler.success(
        res,
        'User fetched successfully',
        HttpStatus.OK,
        req.user,
        req.path
    );
});

