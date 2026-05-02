import { asyncHandler } from '../../middlewares/error.middleware.js';
import { HttpStatus, ResponseHandler } from '../../utils/response.util.js';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';

export const getMe = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const session = req.session as {
            role: string | null;
            permissions: Record<string, string[]> | null;
            activeOrganizationId: string | null | undefined;
        };

        ResponseHandler.success(
            res,
            'User fetched successfully',
            HttpStatus.OK,
            {
                ...req.user,
                role: session.role || null,
                permissions: session.permissions || null,
                activeOrganizationId: session.activeOrganizationId || null
            },
            req.path
        );
    }
);
