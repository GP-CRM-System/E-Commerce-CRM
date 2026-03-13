import { type Request, type Response, type NextFunction } from 'express';
import { auth } from '../api/auth/auth.js';
import {
    AuthenticationError,
    AuthorizationError
} from '../utils/response.util.js';
import { asyncHandler } from './error.middleware.js';
import { fromNodeHeaders } from 'better-auth/node';
import prisma from '../config/prisma.config.js';

/**
 * Middleware to protect routes and ensure a valid session exists.
 *
 * @param req Express request object.
 * @param res Express response object.
 * @param next Express next function.
 * @returns A promise that resolves when the session is validated.
 * @throws AuthenticationError When no active session is found.
 */
export const protect = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });

        if (!session) {
            throw new AuthenticationError(
                'Authentication required. Please log in.'
            );
        }

        (req as any).user = session.user;
        (req as any).session = session.session;

        next();
    }
);

/**
 * Middleware factory that enforces organization role-based authorization
 * by checking permissions defined on roles, not the role name itself.
 *
 * Each permission is of the form `resource:action`, e.g. `orders:read`.
 *
 * Ensures:
 * - The user is authenticated
 * - There is an active organization in the session
 * - The member's role grants at least one of the requested permissions
 *
 * @param permissions One or more permission strings (e.g. "orders:read").
 */
export const requirePermission = (...permissions: string[]) =>
    asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        const headers = fromNodeHeaders(req.headers);
        const session = await auth.api.getSession({ headers });

        if (!session) {
            throw new AuthenticationError(
                'Authentication required. Please log in.'
            );
        }

        const activeOrganizationId = session.session.activeOrganizationId;

        if (!activeOrganizationId) {
            throw new AuthorizationError(
                'No active organization selected for this session.'
            );
        }

        // Use Better Auth's hasPermission API which handles both static and dynamic roles
        const permissionChecks = await Promise.all(
            permissions.map(async (p) => {
                const [resource, action] = p.split(':');
                if (!resource || !action) return false;

                try {
                    const result = await (auth.api as any).hasPermission({
                        headers,
                        body: {
                            permissions: { [resource]: [action] },
                            organizationId: activeOrganizationId
                        }
                    });
                    // result.success is true if the user has the permissions
                    return result.success === true;
                } catch {
                    return false;
                }
            })
        );

        const hasAnyRequiredPermission = permissionChecks.some((has) => has);

        if (!hasAnyRequiredPermission) {
            throw new AuthorizationError(
                'Insufficient permissions for this resource.'
            );
        }

        // Fetch membership to attach to request for downstream use (optional but helpful)
        const membership = await prisma.member.findFirst({
            where: {
                userId: session.user.id,
                organizationId: activeOrganizationId
            }
        });

        (req as any).user = session.user;
        (req as any).session = session.session;
        (req as any).membership = membership;

        next();
    });
