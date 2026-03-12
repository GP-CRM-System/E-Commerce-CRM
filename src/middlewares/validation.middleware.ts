import type { Request, Response, NextFunction } from "express";
import { errorHandler } from "./error.middleware.js";
import type { z } from "better-auth";

/**
 * Create middleware that validates request input against a Zod schema.
 *
 * @param schema Zod schema used to parse and validate input.
 * @param source Request source to validate: body, query, or params.
 * @returns Middleware that validates and normalizes request data.
 */
export const validateRequest = (
    schema: z.ZodType,
    source: "body" | "query" | "params" = "body"
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const data =
                source === "body"
                    ? req.body
                    : source === "query"
                        ? req.query
                        : req.params;

            const result = schema.safeParse(data);

            if (!result.success) {
                errorHandler(result.error, req, res, next);
                return;
            }

            // Replace the data with validated and parsed data
            if (source === "body") {
                req.body = result.data;
            } else if (source === "query") {
                const query = req.query as any;
                for (const key in query) {
                    delete query[key];
                }
                Object.assign(query, result.data);
            } else {
                const params = req.params as any;
                for (const key in params) {
                    delete params[key];
                }
                Object.assign(params, result.data);
            }

            next();
        } catch (err) {
            errorHandler(err as Error, req, res, next);
            return;
        }
    };
};
