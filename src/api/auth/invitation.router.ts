import { Router } from 'express';
import { env } from '../../config/env.config.js';

const invitationRouter = Router();

/**
 * GET /api/accept-invitation
 *
 * Redirect endpoint for invitation links.
 * Receives the invitation ID and invited email from the email link,
 * then redirects to the frontend's accept-invitation page with the
 * email prefilled so the user doesn't have to re-enter it.
 */
invitationRouter.get('/', (req, res) => {
    const { id, email } = req.query;

    if (!id || typeof id !== 'string') {
        res.redirect(302, `${env.appUrl}/accept-invitation?error=invalid_link`);
        return;
    }

    const redirectUrl = new URL('/accept-invitation', env.corsOrigin);
    redirectUrl.searchParams.set('id', id);
    if (email && typeof email === 'string') {
        redirectUrl.searchParams.set('email', email);
    }

    res.redirect(302, redirectUrl.toString());
});

export default invitationRouter;
