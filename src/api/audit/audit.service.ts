import prisma from '../../config/prisma.config.js';
import loggerUtil from '../../utils/logger.util.js';

export type AuditAction =
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'LOGIN'
    | 'LOGOUT'
    | 'INVITE_SEND'
    | 'INVITE_ACCEPT'
    | 'MEMBER_REMOVE'
    | 'ROLE_CHANGE';

export interface CreateAuditLogInput {
    organizationId: string;
    userId: string | null;
    action: string | AuditAction;
    targetId: string;
    targetType: string;
    metadata?: Record<string, unknown>;
}

/**
 * Service to handle creation of audit logs.
 * Audit logs are used to track significant actions in the system for security and compliance.
 */
export class AuditService {
    /**
     * Create a new audit log entry.
     * Fires and forgets in production (logs error but doesn't block),
     * but returns promise for testing/critical paths.
     */
    static async log(input: CreateAuditLogInput) {
        try {
            const log = await prisma.auditLog.create({
                data: {
                    organizationId: input.organizationId,
                    userId: input.userId,
                    action: input.action,
                    targetId: input.targetId,
                    targetType: input.targetType
                }
            });

            loggerUtil.debug(
                { auditLogId: log.id, action: input.action },
                'Audit log created'
            );
            return log;
        } catch (error) {
            loggerUtil.error({ error, input }, 'Failed to create audit log');
        }
    }
}
