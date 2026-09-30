// Production server (Cloud Run): static SPA + Gemini proxy. Cloud Run injects PORT.
import express from 'express';
import { geminiMiddleware } from './gemini.mjs';

const app = express();
app.use('/api/gemini', geminiMiddleware);
app.use(express.static('dist'));
app.listen(process.env.PORT || 8080, () => console.log(`SwasthChain on :${process.env.PORT || 8080}`));
