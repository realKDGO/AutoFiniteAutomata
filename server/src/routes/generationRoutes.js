import { Router } from 'express';
import { postGeneration } from '../controllers/generationController.js';
export const generationRouter = Router();
generationRouter.post('/', postGeneration);