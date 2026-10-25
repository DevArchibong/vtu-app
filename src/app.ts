import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';

export const app = express();

app.use(express.json());
app.use('/api', healthRouter);
app.use(notFoundHandler);
app.use(errorHandler);
