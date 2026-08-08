import { Router } from 'express';
import { healthRouter } from './healthRoutes.js';
import { generationRouter } from './generationRoutes.js';
import { simulationRouter } from './simulationRoutes.js';
import { nfaConversionRouter } from './nfaConversionRoutes.js';

export const v1Router = Router();
v1Router.use('/health', healthRouter);
v1Router.use('/generate', generationRouter);
v1Router.use('/simulate', simulationRouter);
v1Router.use('/convert-nfa', nfaConversionRouter);