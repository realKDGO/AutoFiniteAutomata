import { Router } from 'express';
import { healthRouter } from './healthRoutes.js';
import { generationRouter } from './generationRoutes.js';
import { simulationRouter } from './simulationRoutes.js';
import { nfaConversionRouter } from './nfaConversionRoutes.js';
import { downloadApkRouter } from './downloadApkRoutes.js';
import { versionRouter } from './versionRoutes.js';

export const v1Router = Router();
v1Router.use('/health', healthRouter);
v1Router.use('/generate', generationRouter);
v1Router.use('/simulate', simulationRouter);
v1Router.use('/convert-nfa', nfaConversionRouter);
v1Router.use('/download-apk', downloadApkRouter);
v1Router.use('/version', versionRouter);