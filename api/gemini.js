import { geminiMiddleware } from '../server/gemini.mjs';

export default async function handler(req, res) {
  return geminiMiddleware(req, res);
}
