import { type Request, type Response, type NextFunction } from "express";
import { auth } from "../auth/auth.js";
import { AuthenticationError } from "../utils/response.util.js";
import { asyncHandler } from "./error.middleware.js";
import { fromNodeHeaders } from "better-auth/node";

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
                "Authentication required. Please log in."
            );
        }

        // Attach session to request for downstream handlers
        (req as any).user = session.user;
        (req as any).session = session.session;

        next();
    }
);
