import { type Response } from 'express';
import logger from './logger.util.js';

export enum HttpStatus {
    // Success
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    NO_CONTENT = 204,
    PAYMENT_REQUIRED = 402,

    // Client errors
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    IM_A_TEAPOT = 418,
    TOO_MANY_REQUESTS = 429,

    // Server errors
    INTERNAL_SERVER_ERROR = 500,
    NOT_IMPLEMENTED = 501,
    SERVICE_UNAVAILABLE = 503
}

export enum ErrorCode {
    // Auth errors
    INVALID_CREDENTIALS = 'AUTH_OO1',
    USER_NOT_FOUND = 'AUTH_OO2',
    USER_ALREADY_EXISTS = 'AUTH_OO3',
    INVALID_TOKEN = 'AUTH_OO4',
    EXPIRED_TOKEN = 'AUTH_OO5',

    // Validation errors
    VALIDATION_ERROR = 'VAL_OO1',
    INVALID_INPUT = 'VAL_OO2',
    MISSING_INPUT = 'VAL_OO3',

    // Resource errors
    RESOURCE_NOT_FOUND = 'RES_OO1',
    RESOURCE_ALREADY_EXISTS = 'RES_OO2',
    RESOURCE_CONFLICT = 'RES_OO3',
    RESOURCE_LIMIT_REACHED = 'RES_OO4',
    RESOURCE_NOT_ALLOWED = 'RES_OO5',

    // Server errors
    SERVER_ERROR = 'SRV_OO1',
    NOT_IMPLEMENTED = 'SRV_OO2',
    DATABASE_ERROR = 'SRV_OO3',
    RATE_LIMIT_EXCEEDED = 'SRV_OO4',
    SUBSCRIPTION_REQUIRED = 'SRV_005'
}

export interface SuccessResponse<T> {
    message: string;
    data?: T;
    timestamp: Date;
    path?: string;
}

export interface ErrorResponse {
    message: string;
    code: ErrorCode;
    status: HttpStatus;
    timestamp: Date;
    path?: string;
    details?: Record<string, unknown>;
}

export class ResponseHandler {
    /**
     * Send a standardized success response.
     *
     * @param res Express response object.
     * @param message Human-readable success message.
     * @param status HTTP status code to send.
     * @param data Optional response payload.
     * @param path Optional request path metadata.
     * @returns The serialized success response.
     */
    static success<T>(
        res: Response,
        message: string,
        status: HttpStatus,
        data?: T,
        path?: string
    ): Response {
        const response: SuccessResponse<T> = {
            message,
            data,
            timestamp: new Date(),
            path
        };

        logger.info(`[SUCCESS]: ${message} - Path: ${path}`);
        return res.status(status).json(response);
    }

    /**
     * Send a standardized error response.
     *
     * @param res Express response object.
     * @param message Human-readable error message.
     * @param code Application-specific error code.
     * @param status HTTP status code to send.
     * @param path Optional request path metadata.
     * @param details Optional structured error details.
     * @returns The serialized error response.
     */
    static error(
        res: Response,
        message: string,
        code: ErrorCode,
        status: HttpStatus,
        path?: string,
        details?: Record<string, unknown>
    ): Response {
        const response: ErrorResponse = {
            message,
            code,
            status,
            timestamp: new Date(),
            path,
            details
        };
        logger.error(
            `[ERROR] ${message} - Code: ${code} - Status: ${status} - Path: ${path || 'N/A'}`
        );
        return res.status(status).json(response);
    }

    /**
     * Send a paginated success response with paging metadata.
     *
     * @param res Express response object.
     * @param data List of items for the current page.
     * @param message Human-readable success message.
     * @param page Current page number.
     * @param limit Maximum items per page.
     * @param total Total number of items across all pages.
     * @param path Optional request path metadata.
     * @returns The serialized paginated response.
     */
    static paginated<T>(
        res: Response,
        data: T[],
        message: string,
        page: number,
        limit: number,
        total: number,
        path?: string
    ): Response {
        const response = {
            success: true,
            message,
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            timestamp: new Date().toISOString(),
            path
        };

        logger.info(
            `[Paginated] ${message} - Page: ${page}, Total: ${total} - Path: ${path || 'N/A'}`
        );

        return res.status(HttpStatus.OK).json(response);
    }

    /**
     * Send a created response using the standard success envelope.
     *
     * @param res Express response object.
     * @param message Human-readable creation message.
     * @param data Created resource payload.
     * @param path Optional request path metadata.
     * @returns The serialized created response.
     */
    static created<T>(
        res: Response,
        message: string,
        data: T,
        path?: string
    ): Response {
        logger.info(`[CREATED]: ${message} - Path: ${path}`);
        return this.success(res, message, HttpStatus.CREATED, data, path);
    }
}

export class AppError extends Error {
    public status: HttpStatus;
    public code: ErrorCode | string;
    public details?: Record<string, unknown>;

    /**
     * Create a typed application error with HTTP metadata.
     *
     * @param message Human-readable error message.
     * @param status HTTP status associated with the error.
     * @param code Application-specific error code.
     * @param details Optional structured details for debugging or clients.
     */
    constructor(
        message: string,
        status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode | string = ErrorCode.SERVER_ERROR,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

export class AuthenticationError extends AppError {
    /**
     * Create an authentication-specific application error.
     *
     * @param message Human-readable authentication error message.
     * @param status HTTP status associated with authentication failures.
     * @param code Application-specific authentication error code.
     */
    constructor(
        message: string = 'Invalid credentials',
        status: HttpStatus = HttpStatus.UNAUTHORIZED,
        code: ErrorCode = ErrorCode.INVALID_CREDENTIALS
    ) {
        super(message, status, code);
        Object.setPrototypeOf(this, AuthenticationError.prototype);
    }
}

export class AuthorizationError extends AppError {
    /**
     * Create an authorization-specific application error.
     *
     * @param message Human-readable authorization error message.
     * @param status HTTP status associated with authorization failures.
     * @param code Application-specific authorization error code.
     */
    constructor(
        message: string = 'Insufficient permissions',
        status: HttpStatus = HttpStatus.FORBIDDEN,
        code: ErrorCode = ErrorCode.INVALID_INPUT
    ) {
        super(message, status, code);
        Object.setPrototypeOf(this, AuthorizationError.prototype);
    }
}

export class NotFoundError extends AppError {
    /**
     * Create a resource-not-found application error.
     *
     * @param message Human-readable not-found error message.
     * @param status HTTP status associated with missing resources.
     * @param code Application-specific not-found error code.
     */
    constructor(
        message: string = 'Resource not found',
        status: HttpStatus = HttpStatus.NOT_FOUND,
        code: ErrorCode = ErrorCode.RESOURCE_NOT_FOUND
    ) {
        super(message, status, code);
        Object.setPrototypeOf(this, NotFoundError.prototype);
    }
}

export class BadRequestError extends AppError {
    /**
     * Create a bad-request application error.
     *
     * @param message Human-readable bad request error message.
     * @param status HTTP status associated with bad requests.
     * @param code Application-specific bad request error code.
     */
    constructor(
        message: string = 'Bad request',
        status: HttpStatus = HttpStatus.BAD_REQUEST,
        code: ErrorCode = ErrorCode.INVALID_INPUT
    ) {
        super(message, status, code);
        Object.setPrototypeOf(this, BadRequestError.prototype);
    }
}
