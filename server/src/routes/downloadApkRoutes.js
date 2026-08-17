import { Router } from 'express';
import { downloadApkController } from '../controllers/downloadApkController.js';

export const downloadApkRouter = Router();
downloadApkRouter.get('/', downloadApkController);
