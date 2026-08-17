import { Router } from 'express';
import { getVersionController } from '../controllers/versionController.js';

export const versionRouter = Router();
versionRouter.get('/', getVersionController);
