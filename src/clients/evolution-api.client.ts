import axios, { AxiosInstance } from 'axios';
import fs from 'fs/promises';
import mime from 'mime-types';
import path from 'path';

import { env, evolutionConfigured } from '../config/env.js';

type WhatsAppNumberResult = {
  jid: string;
  exists: boolean;
  number: string;
  name?: string;
};

export class EvolutionApiClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.evolutionApiUrl,
      headers: {
        apikey: env.evolutionApiKey,
      },
      timeout: 30000,
    });
  }

  isConfigured() {
    return evolutionConfigured;
  }

  async checkWhatsApp(number: string) {
    const response = await this.http.post<WhatsAppNumberResult[]>(
      `/chat/whatsappNumbers/${encodeURIComponent(env.evolutionInstanceName)}`,
      { numbers: [number] },
    );

    return response.data[0] ?? null;
  }

  async sendText(number: string, text: string) {
    return this.http.post(`/message/sendText/${encodeURIComponent(env.evolutionInstanceName)}`, {
      number,
      text,
    });
  }

  async sendVideo(number: string, filePath: string, caption?: string) {
    const file = await fs.readFile(filePath);
    const mimetype = mime.lookup(filePath) || 'video/mp4';

    return this.http.post(`/message/sendMedia/${encodeURIComponent(env.evolutionInstanceName)}`, {
      number,
      mediatype: 'video',
      mimetype,
      caption: caption || '',
      media: file.toString('base64'),
      fileName: path.basename(filePath),
    });
  }

  async configureWebhook(webhookUrl: string) {
    if (!this.isConfigured()) {
      return;
    }

    const events = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE'];
    const headers: Record<string, string> = {};

    if (env.evolutionWebhookSecret) {
      headers['x-buzke-webhook-secret'] = env.evolutionWebhookSecret;
    }

    await this.http.post(`/webhook/set/${encodeURIComponent(env.evolutionInstanceName)}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        headers,
        events,
      },
    });
  }
}