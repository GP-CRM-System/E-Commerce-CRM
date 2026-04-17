import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import * as messagingService from './messaging.service.js';
import prisma from '../../config/prisma.config.js';
import {
    ResponseHandler,
    HttpStatus,
    ErrorCode
} from '../../utils/response.util.js';
import { asyncHandler } from '../../middlewares/error.middleware.js';
import { getPagination } from '../../utils/pagination.util.js';

export const listConversations = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '20'
            },
            20
        );

        const [conversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where: { organizationId },
                orderBy: { lastMessageAt: 'desc' },
                include: { customer: { select: { name: true, email: true } } },
                take,
                skip
            }),
            prisma.conversation.count({ where: { organizationId } })
        ]);

        return ResponseHandler.paginated(
            res,
            conversations,
            'Conversations fetched successfully',
            page,
            limit,
            total
        );
    }
);

export const getConversationMessages = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;

        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, organizationId }
        });

        if (!conversation) {
            return ResponseHandler.error(
                res,
                'Conversation not found',
                ErrorCode.RESOURCE_NOT_FOUND,
                HttpStatus.NOT_FOUND
            );
        }

        const { skip, take, page, limit } = getPagination(
            {
                page: (req.query.page as string) || '1',
                limit: (req.query.limit as string) || '50'
            },
            50
        );

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'asc' },
                take,
                skip
            }),
            prisma.message.count({ where: { conversationId } })
        ]);

        return ResponseHandler.paginated(
            res,
            messages,
            'Messages fetched successfully',
            page,
            limit,
            total
        );
    }
);

export const sendMessage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
        const organizationId = req.session.activeOrganizationId!;
        const conversationId = req.params.id as string;
        const { content, type, metadata } = req.body;

        if (!content) {
            return ResponseHandler.error(
                res,
                'Message content is required',
                ErrorCode.VALIDATION_ERROR,
                HttpStatus.BAD_REQUEST
            );
        }

        const message = await messagingService.sendOutboundMessage({
            organizationId,
            conversationId,
            content,
            type,
            metadata
        });

        return ResponseHandler.success(
            res,
            'Message sent successfully',
            HttpStatus.OK,
            message
        );
    }
);
