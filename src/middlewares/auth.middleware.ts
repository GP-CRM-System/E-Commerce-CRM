import { type Request, type Response, type NextFunction } from 'express';
import { auth } from '../api/auth/auth.js';
import {
    AuthenticationError,
    AuthorizationError
} from '../utils/response.util.js';
import { asyncHandler } from './error.middleware.js';
import { fromNodeHeaders } from 'better-auth/node';
import prisma from '../config/prisma.config.js';

export type AuthenticatedRequest = Request & {
    user: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        emailVerified: boolean;
        name: string;
        image?: string | null | undefined;
    };
    session: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null | undefined;
        userAgent?: string | null | undefined;
        activeOrganizationId?: string | null | undefined;
    };
    membership?: unknown; // Optional, as it's only attached by requirePermission
};

/**
 * Middleware to protect routes and ensure a valid session exists.
 *
 * @param req Express request object.
 * @param res Express response object.
 * @param next Express next function.
 * @returns A promise that resolves when the session is validated.
 * @throws AuthenticationError When no active session is found.
 */
export const protect = asyncHandler<AuthenticatedRequest>(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        });

        if (!session) {
            throw new AuthenticationError(
                'Authentication required. Please log in.'
            );
        }

        req.user = session.user;
        req.session = session.session;

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
    asyncHandler<AuthenticatedRequest>(async (req, res, next) => {
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
                    const result = await auth.api.hasPermission({
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

        req.user = session.user;
        req.session = session.session;
        req.membership = membership;

        next();
    });
