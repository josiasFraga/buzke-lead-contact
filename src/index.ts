import express from 'express';

import { env } from './config/env.js';
import { LeadAutomationService } from './services/lead-automation.service.js';

const app = express();
const port = env.port;
const automationService = new LeadAutomationService();

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, webhookConfigured: automationService.isWebhookConfigured() });
});

app.post('/webhooks/evolution', async (req, res) => {
  try {
    const result = await automationService.handleIncomingWebhook(
      req.body,
      req.header('x-buzke-webhook-secret') || undefined,
    );
    res.status(200).json(result);
  } catch (error) {
    console.error('erro ao processar webhook da Evolution', error);
    res.status(401).json({ error: error instanceof Error ? error.message : 'Webhook inválido' });
  }
});

async function main() {
  await automationService.bootstrap();
  automationService.start();

  app.listen(port, () => {
    console.log(`lead-contact listening on ${port}`);
  });
}

void main();