import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.middleware.js';
import * as messagingController from './messaging.controller.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';
import { sendMessageSchema } from './messaging.schemas.js';
import metaWebhookRouter from './meta-webhook.router.js';

const router = Router();

// Webhook routes (Public/Signature verified)
router.use('/', metaWebhookRouter);

// API routes (Protected)
router
    .route('/conversations')
    .get(
        requirePermission('conversations:read'),
        validateRequest(paginationSchema, 'query'),
        messagingController.listConversations
    );

router
    .route('/conversations/:id/messages')
    .get(
        requirePermission('conversations:read'),
        validateRequest(paginationSchema, 'query'),
        messagingController.getConversationMessages
    )
    .post(
        requirePermission('conversations:write'),
        validateRequest(sendMessageSchema, 'body'),
        messagingController.sendMessage
    );

export default router;
