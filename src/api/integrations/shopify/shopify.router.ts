import { Router } from 'express';
import {
    requirePermission,
    protect
} from '../../../middlewares/auth.middleware.js';
import * as shopifyController from './shopify.controller.js';

const router = Router();

// /api/integrations/shopify/auth
router.get(
    '/auth',
    protect,
    requirePermission('integrations:write'),
    shopifyController.startAuth
);

// /api/integrations/shopify/callback
// NOTE: We don't use requireAuth here because Shopify redirects the user here,
// and it might not include the Authorization header for API tokens.
// However, since we set a signed cookie, we can validate the session through the cookie.
router.get('/callback', shopifyController.callback);

export default router;
