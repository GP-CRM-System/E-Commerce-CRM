// import type { Response } from 'express';
// import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
// import { ResponseHandler } from '../../utils/response.util.js';
// import { asyncHandler } from '../../middlewares/error.middleware.js';
// import * as analyticsService from './analytics.service.js';

// export const getAnalytics = asyncHandler(
//     async (req: AuthenticatedRequest, res: Response) => {
//         const response = await analyticsService.getAnalytics();
//         ResponseHandler.success(
//             res,
//             'Analytics retrieved successfully',
//             200,
//             response
//         );
//     }
// );
