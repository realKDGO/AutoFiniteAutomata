import { Router } from 'express';
import { postConvertNfa } from '../controllers/nfaConversionController.js';

export const nfaConversionRouter = Router();
nfaConversionRouter.post('/', postConvertNfa);
