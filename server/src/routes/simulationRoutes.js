import { Router } from 'express';
import { postSimulation } from '../controllers/simulationController.js';
export const simulationRouter = Router();
simulationRouter.post('/', postSimulation);