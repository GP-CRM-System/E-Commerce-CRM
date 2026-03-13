import { asyncHandler } from '../../middlewares/error.middleware.js';
import { auth } from './auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { AuthenticationError, HttpStatus, ResponseHandler } from '../../utils/response.util.js';
import type { Request, Response } from 'express';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers)
    });

    if (!session) {
        throw new AuthenticationError(
            'Authentication required. Please log in.'
        );
    }

    ResponseHandler.success(
        res,
        'User fetched successfully',
        HttpStatus.OK,
        session.user,
        req.path
    );
});
