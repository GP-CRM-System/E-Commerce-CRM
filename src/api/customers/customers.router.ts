import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import * as customerController from './customer.controller.js';
import * as customerSchema from './customer.schemas.js';
import { validateRequest } from '../../middlewares/validation.middleware.js';
import { paginationSchema } from '../../utils/pagination.util.js';

const router = Router();

router.use(protect);

router
    .route('/')
    .get(validateRequest(paginationSchema, 'query'), customerController.getAllCustomers)
    .post(validateRequest(customerSchema.createCustomer), customerController.createCustomer);

router.route("/:id")
    .get(customerController.getCustomer)
    .put(validateRequest(customerSchema.updateCustomer), customerController.updateCustomer)
    .delete(customerController.deleteCustomer);

export default router;
