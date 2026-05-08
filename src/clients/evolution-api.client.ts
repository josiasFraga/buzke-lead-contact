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

type ReadMessageInput = {
  remoteJid: string;
  fromMe: boolean;
  id: string;
};

export class EvolutionApiClient {
  private readonly http: AxiosInstance;
  private sendQueue = Promise.resolve();
  private lastSendAt = 0;
  private pendingOutboundCount = 0;

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
    return this.enqueueOutbound(async () =>
      this.http.post(`/message/sendText/${encodeURIComponent(env.evolutionInstanceName)}`, {
        number,
        text,
        delay: env.evolutionTypingDelayMs,
      }),
      { type: 'text', number },
    );
  }

  async sendVideo(number: string, filePath: string, caption?: string) {
    return this.enqueueOutbound(async () => {
      const file = await fs.readFile(filePath);
      const mimetype = mime.lookup(filePath) || 'video/mp4';

      return this.http.post(`/message/sendMedia/${encodeURIComponent(env.evolutionInstanceName)}`, {
        number,
        mediatype: 'video',
        mimetype,
        caption: caption || '',
        media: file.toString('base64'),
        fileName: path.basename(filePath),
        delay: env.evolutionTypingDelayMs,
      });
    }, { type: 'video', number });
  }

  private enqueueOutbound<T>(send: () => Promise<T>, context?: { type: 'text' | 'video'; number: string }) {
    this.pendingOutboundCount += 1;
    this.debugLog('outbound na fila', {
      type: context?.type,
      number: context?.number,
      pending: this.pendingOutboundCount,
    });

    const next = this.sendQueue
      .catch(() => undefined)
      .then(async () => {
        const waitMs = this.getOutboundWaitMs();
        if (waitMs > 0) {
          this.debugLog('aguardando janela de envio', {
            type: context?.type,
            number: context?.number,
            waitMs,
            pending: this.pendingOutboundCount,
          });
          await this.waitForOutboundGap(waitMs);
        }

        this.pendingOutboundCount -= 1;
        this.debugLog('iniciando envio outbound', {
          type: context?.type,
          number: context?.number,
          pending: this.pendingOutboundCount,
        });

        try {
          const result = await send();
          this.lastSendAt = Date.now();
          this.debugLog('envio outbound concluido', {
            type: context?.type,
            number: context?.number,
          });
          return result;
        } catch (error) {
          this.lastSendAt = Date.now();
          this.debugLog('envio outbound falhou', {
            type: context?.type,
            number: context?.number,
            error: error instanceof Error ? error.message : error,
          });
          throw error;
        }
      });

    this.sendQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private getOutboundWaitMs() {
    const gapMs = env.outboundMessageGapMs;
    if (gapMs <= 0 || this.lastSendAt === 0) {
      return 0;
    }

    return Math.max(0, this.lastSendAt + gapMs - Date.now());
  }

  private async waitForOutboundGap(waitMs: number) {
    if (waitMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  private debugLog(message: string, metadata?: Record<string, unknown>) {
    if (!env.debug) {
      return;
    }

    console.log('[evolution-outbound]', message, metadata ?? {});
  }

  async markMessagesAsRead(readMessages: ReadMessageInput[]) {
    if (readMessages.length === 0) {
      return;
    }

    return this.http.post(`/chat/markMessageAsRead/${encodeURIComponent(env.evolutionInstanceName)}`, {
      readMessages,
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