import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/prisma.config.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ResponseHandler } from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';

export const listLogs = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '20'
            },
            20
        );

        const targetType = req.query.targetType as string;
        const action = req.query.action as string;

        const where: Prisma.AuditLogWhereInput = { organizationId };
        if (targetType) where.targetType = targetType;
        if (action) where.action = action;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { name: true, email: true } } },
                take,
                skip
            }),
            prisma.auditLog.count({ where })
        ]);

        return ResponseHandler.paginated(
            res,
            logs,
            'Audit logs fetched successfully',
            page,
            limit,
            total
        );
    }
);
