import path from 'path';

import { EvolutionApiClient } from '../clients/evolution-api.client.js';
import { GeminiClient } from '../clients/gemini.client.js';
import { env } from '../config/env.js';
import { isWithinBusinessHours } from '../lib/business-hours.js';
import { detectConversationHeuristic, shouldRouteToHumanHandoff } from '../lib/conversation-policy.js';
import {
  humanHandoffReply,
  initialGreetingMessage,
  initialPitchMessage,
  noInterestReply,
  noInterestVideoCaption,
  stopContactReply,
  systemCounterProposal,
  videoCaption,
} from '../lib/message-templates.js';
import { jidToPhone, normalizePhone } from '../lib/phone.js';
import { LeadsRepository } from '../repositories/leads.repository.js';
import {
  followUpQueueStatuses,
  IncomingLeadMessage,
  initialQueueStatuses,
  LeadRecord,
  ReplyClassification,
  terminalLeadStatuses,
} from '../types/leads.js';

const videoFilePath = path.resolve('video', 'gestao-profissional-de-quadras-esportivas.mp4');
type PendingIncomingMessage = {
  messages: IncomingLeadMessage[];
  timer: ReturnType<typeof setTimeout>;
};

function looksLikeAutomaticMessage(text: string) {
  const normalized = text.toLowerCase();
  const rules = [
    'mensagem automática',
    'resposta automática',
    'sou um assistente virtual',
    'atendimento automático',
    'fora do horário',
    'horário de atendimento',
    'selecione uma opção',
    'digite uma opção',
    'ausente no momento',
    'não posso responder agora',
  ];

  return rules.some((rule) => normalized.includes(rule));
}

function shouldMoveToResponded(status: LeadRecord['status']) {
  return status === 'mensagem_enviada' || status === 'contato_iniciado' || status === 'abordagem_pendente';
}

function hasReachedPitchStage(status: LeadRecord['status']) {
  return [
    'mensagem_enviada',
    'respondeu',
    'pediu_video',
    'video_enviado',
    'usa_sistema',
    'contra_argumento_sugerido',
    'passar_para_vendas',
    'sem_interesse',
    'pediu_para_parar',
    'perdido',
    'convertido',
  ].includes(status);
}

function hasReachedVideoStage(status: LeadRecord['status']) {
  return ['video_enviado', 'passar_para_vendas', 'sem_interesse', 'pediu_para_parar', 'perdido', 'convertido'].includes(status);
}

function canSendSystemCounterProposal(status: LeadRecord['status']) {
  return status === 'mensagem_enviada' || status === 'contra_argumento_sugerido';
}

function canSendVideo(status: LeadRecord['status']) {
  return status === 'mensagem_enviada' || status === 'pediu_video';
}

export class LeadAutomationService {
  private readonly repository = new LeadsRepository();
  private readonly evolutionClient = new EvolutionApiClient();
  private readonly geminiClient = new GeminiClient();
  private readonly pendingIncomingMessages = new Map<string, PendingIncomingMessage>();
  private processing = false;
  private webhookConfigured = false;

  private buildErrorMetadata(error: unknown) {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }

    return { error: String(error) };
  }

  async bootstrap() {
    if (this.evolutionClient.isConfigured() && env.appBaseUrl) {
      const webhookUrl = `${env.appBaseUrl}/webhooks/evolution`;
      try {
        await this.evolutionClient.configureWebhook(webhookUrl);
        this.webhookConfigured = true;
        console.log(`webhook registrado em ${webhookUrl}`);
      } catch (error) {
        console.error('falha ao registrar webhook na Evolution API', error);
      }
    }

    if (!this.evolutionClient.isConfigured()) {
      console.warn('Evolution API não configurada. O serviço sobe, mas não enviará mensagens até receber EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME.');
    }
  }

  isWebhookConfigured() {
    return this.webhookConfigured;
  }

  start() {
    setInterval(() => {
      void this.tick();
    }, env.leadPollIntervalMs);

    void this.tick();
  }

  async tick() {
    if (this.processing || !this.evolutionClient.isConfigured()) {
      return;
    }

    if (!isWithinBusinessHours()) {
      return;
    }

    this.processing = true;

    try {
      await this.processPendingFollowUps();
      await this.processNextInitialLead();
    } catch (error) {
      console.error('erro no ciclo do worker', error);
    } finally {
      this.processing = false;
    }
  }

  async handleIncomingWebhook(body: unknown, receivedSecret?: string) {
    if (env.evolutionWebhookSecret && receivedSecret !== env.evolutionWebhookSecret) {
      throw new Error('Webhook secret inválido');
    }

    const incomingMessages = this.extractIncomingMessages(body);

    await this.markIncomingMessagesAsRead(incomingMessages);

    for (const incoming of incomingMessages) {
      this.queueIncomingMessage(incoming);
    }

    return { received: incomingMessages.length, queued: incomingMessages.length };
  }

  private async markIncomingMessagesAsRead(messages: IncomingLeadMessage[]) {
    const readMessages = messages
      .filter((message) => !message.fromMe && message.messageId && message.remoteJid)
      .map((message) => ({
        remoteJid: message.remoteJid,
        fromMe: false,
        id: message.messageId,
      }));

    if (readMessages.length === 0) {
      return;
    }

    try {
      await this.evolutionClient.markMessagesAsRead(readMessages);
    } catch (error) {
      console.error('falha ao marcar mensagens como lidas', error);
    }
  }

  private queueIncomingMessage(incoming: IncomingLeadMessage) {
    const key = incoming.remoteJid || incoming.phone;
    const existing = this.pendingIncomingMessages.get(key);

    if (existing) {
      clearTimeout(existing.timer);

      const knownIds = new Set(existing.messages.map((message) => message.messageId));
      if (!knownIds.has(incoming.messageId)) {
        existing.messages.push(incoming);
      }

      existing.timer = setTimeout(() => {
        void this.flushPendingIncomingMessages(key);
      }, env.incomingMessageDebounceMs);
      return;
    }

    const timer = setTimeout(() => {
      void this.flushPendingIncomingMessages(key);
    }, env.incomingMessageDebounceMs);

    this.pendingIncomingMessages.set(key, {
      messages: [incoming],
      timer,
    });
  }

  private async flushPendingIncomingMessages(key: string) {
    const pending = this.pendingIncomingMessages.get(key);
    if (!pending) {
      return;
    }

    this.pendingIncomingMessages.delete(key);

    const combined = this.combineIncomingMessages(pending.messages);
    await this.handleIncomingMessage(combined);
  }

  private combineIncomingMessages(messages: IncomingLeadMessage[]): IncomingLeadMessage {
    const baseMessage = messages[messages.length - 1] ?? messages[0];
    const uniqueMessages = messages.filter((message, index, all) => all.findIndex((item) => item.messageId === message.messageId) === index);

    return {
      ...baseMessage,
      messageIds: uniqueMessages.map((message) => message.messageId),
      messageId: baseMessage.messageId,
      text: uniqueMessages
        .map((message) => message.text.trim())
        .filter(Boolean)
        .join('\n')
        .trim(),
    };
  }

  private async processPendingFollowUps() {
    const lead = await this.repository.findNextFollowUpLead(followUpQueueStatuses);
    if (!lead) {
      return;
    }

    if (lead.status === 'pediu_video') {
      await this.sendVideoToLead(lead);
      return;
    }

    if (lead.status === 'contra_argumento_sugerido') {
      await this.sendSystemCounterProposal(lead);
      return;
    }

    if (lead.status === 'pitch_pendente') {
      await this.sendInitialPitchToLead(lead);
    }
  }

  private async processNextInitialLead() {
    const lead = await this.repository.findNextInitialLead(initialQueueStatuses);
    if (!lead) {
      return;
    }

    const claimed = await this.repository.updateStatusIfCurrent(lead.id, lead.status, 'contato_iniciado');
    if (!claimed) {
      return;
    }

    const normalizedPhone = normalizePhone(lead.telefone);
    if (!normalizedPhone) {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: 'contato_iniciado',
        toStatus: 'numero_invalido',
        message: 'Telefone inválido para envio via WhatsApp.',
      });

      await this.repository.createInteraction({
        leadId: lead.id,
        tipo: 'erro',
        mensagem: 'Telefone não pôde ser normalizado.',
      });
      return;
    }

    const waCheck = await this.evolutionClient.checkWhatsApp(normalizedPhone);
    if (!waCheck?.exists) {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: 'contato_iniciado',
        toStatus: 'sem_whatsapp',
        message: 'Número não encontrado no WhatsApp.',
        metadata: waCheck,
      });
      return;
    }

    try {
      await this.evolutionClient.sendText(normalizedPhone, initialGreetingMessage);
    } catch (error) {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: 'contato_iniciado',
        toStatus: 'erro',
        message: 'Falha ao enviar abordagem inicial via WhatsApp.',
        metadata: this.buildErrorMetadata(error),
      });
      throw error;
    }

    await this.repository.updateStatus(lead.id, 'saudacao_enviada', {
      firstContact: true,
      lastContact: true,
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'mensagem_enviada',
      mensagem: initialGreetingMessage,
      metadados: { channel: 'whatsapp', template: 'initial_greeting', phone: normalizedPhone },
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'status_alterado',
      mensagem: 'Saudação inicial enviada via WhatsApp.',
      statusAnterior: 'contato_iniciado',
      statusNovo: 'saudacao_enviada',
      metadados: { phone: normalizedPhone, waCheck },
    });
  }

  private async handleIncomingMessage(incoming: IncomingLeadMessage) {
    if (incoming.fromMe || !incoming.text.trim()) {
      return;
    }

    const lead = await this.repository.findByPhone(incoming.phone);
    if (!lead) {
      return;
    }

    const messageIds = incoming.messageIds?.filter(Boolean) ?? [incoming.messageId];
    const alreadyProcessed = await this.repository.hasProcessedIncomingMessage(lead.id, incoming.remoteJid, messageIds);
    if (alreadyProcessed) {
      return;
    }

    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'resposta_recebida',
      mensagem: incoming.text,
      metadados: {
        event: incoming.event,
        messageId: incoming.messageId,
        messageIds,
        remoteJid: incoming.remoteJid,
        pushName: incoming.pushName,
      },
    });

    if (terminalLeadStatuses.has(lead.status)) {
      return;
    }

    if (looksLikeAutomaticMessage(incoming.text)) {
      await this.repository.createInteraction({
        leadId: lead.id,
        tipo: 'ia_classificacao',
        mensagem: 'Mensagem automática detectada por heurística.',
        metadados: {
          intent: 'AUTO_MESSAGE',
          automatic: true,
          shouldReply: false,
          replySuppressedReason: 'Mensagem automática detectada por heurística.',
        },
      });
      return;
    }

    if (lead.status === 'saudacao_enviada') {
      const greetingHeuristic = detectConversationHeuristic(incoming.text, lead);

      if (greetingHeuristic?.stopContact) {
        await this.repository.createInteraction({
          leadId: lead.id,
          tipo: 'ia_classificacao',
          mensagem: greetingHeuristic.summary,
          metadados: greetingHeuristic,
        });
        await this.repository.saveConversationSummary(lead.id, greetingHeuristic.conversationSummary);
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'pediu_para_parar',
          message: 'Lead pediu para encerrar o contato após a saudação inicial.',
          metadata: greetingHeuristic,
          lastContact: true,
        });

        if (isWithinBusinessHours()) {
          await this.evolutionClient.sendText(incoming.phone, stopContactReply);
          await this.repository.createInteraction({
            leadId: lead.id,
            tipo: 'mensagem_enviada',
            mensagem: stopContactReply,
            metadados: { template: 'stop_contact_reply' },
          });
        }
        return;
      }

      if (greetingHeuristic?.intent === 'NO_INTEREST') {
        await this.repository.createInteraction({
          leadId: lead.id,
          tipo: 'ia_classificacao',
          mensagem: greetingHeuristic.summary,
          metadados: greetingHeuristic,
        });
        await this.repository.saveConversationSummary(lead.id, greetingHeuristic.conversationSummary);
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'sem_interesse',
          message: 'Lead não demonstrou interesse após a saudação inicial.',
          metadata: greetingHeuristic,
          lastContact: true,
        });

        if (isWithinBusinessHours()) {
          await this.sendNoInterestClosing(lead, incoming.phone, greetingHeuristic);
        }
        return;
      }

      if (isWithinBusinessHours()) {
        const claimedPitch = await this.repository.updateStatusIfCurrent(lead.id, 'saudacao_enviada', 'pitch_pendente');
        if (!claimedPitch) {
          return;
        }

        await this.sendInitialPitchToLead(lead, incoming.phone, 'pitch_pendente');
      } else {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'pitch_pendente',
          message: 'Lead respondeu à saudação inicial; pitch completo pendente para próximo horário útil.',
          metadata: { trigger: 'greeting_reply', message: incoming.text },
          lastContact: true,
        });
      }
      return;
    }

    const recentConversation = await this.repository.getRecentConversationContext(lead.id);
    const storedSummary = await this.repository.getLatestConversationSummary(lead.id);
    const conversationHeuristic = detectConversationHeuristic(incoming.text, lead);

    if (conversationHeuristic) {
      const classification = conversationHeuristic;

      await this.repository.createInteraction({
        leadId: lead.id,
        tipo: 'ia_classificacao',
        mensagem: classification.summary,
        metadados: classification,
      });
      await this.repository.saveConversationSummary(lead.id, classification.conversationSummary);

      if (classification.automatic) {
        return;
      }

      if (classification.stopContact) {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'pediu_para_parar',
          message: 'Lead pediu para encerrar o contato.',
          metadata: classification,
          lastContact: true,
        });

        if (isWithinBusinessHours()) {
          await this.evolutionClient.sendText(incoming.phone, stopContactReply);
          await this.repository.createInteraction({
            leadId: lead.id,
            tipo: 'mensagem_enviada',
            mensagem: stopContactReply,
            metadados: { template: 'stop_contact_reply' },
          });
        }
        return;
      }

      if (classification.intent === 'NO_INTEREST') {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'sem_interesse',
          message: 'Lead informou que não tem interesse.',
          metadata: classification,
          lastContact: true,
        });

        if (isWithinBusinessHours()) {
          await this.sendNoInterestClosing(lead, incoming.phone, classification);
        }
        return;
      }

      if (classification.intent === 'ALLOW_VIDEO' || classification.allowedVideo) {
        if (isWithinBusinessHours()) {
          await this.sendVideoToLead(lead, incoming.phone, classification);
        } else {
          await this.repository.setStatusWithInteraction({
            leadId: lead.id,
            fromStatus: lead.status,
            toStatus: 'pediu_video',
            message: 'Lead autorizou envio do vídeo, aguardando horário útil para envio.',
            metadata: classification,
            lastContact: true,
          });
        }
        return;
      }

      if (shouldRouteToHumanHandoff({ lead, classification, storedSummary, latestMessage: incoming.text })) {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'passar_para_vendas',
          message: 'Lead qualificado para atendimento humano.',
          metadata: classification,
          lastContact: true,
        });

        if (isWithinBusinessHours()) {
          await this.evolutionClient.sendText(incoming.phone, humanHandoffReply);
          await this.repository.createInteraction({
            leadId: lead.id,
            tipo: 'mensagem_enviada',
            mensagem: humanHandoffReply,
            metadados: { template: 'human_handoff_reply' },
          });
        }
        return;
      }

      if ((classification.intent === 'USES_SYSTEM' || classification.mentionsExistingSystem) && lead.status !== 'usa_sistema') {
        if (isWithinBusinessHours()) {
          await this.sendSystemCounterProposal(lead, classification, incoming.phone);
        } else {
          await this.repository.setStatusWithInteraction({
            leadId: lead.id,
            fromStatus: lead.status,
            toStatus: 'contra_argumento_sugerido',
            message: 'Lead informou que já usa sistema. Contraproposta pendente para próximo horário útil.',
            metadata: classification,
            lastContact: true,
          });
        }
        return;
      }

      if (!classification.shouldReply) {
        if (shouldMoveToResponded(lead.status)) {
          await this.repository.setStatusWithInteraction({
            leadId: lead.id,
            fromStatus: lead.status,
            toStatus: 'respondeu',
            message: classification.replySuppressedReason,
            metadata: classification,
            lastContact: true,
          });
        }
        return;
      }

      if (shouldMoveToResponded(lead.status)) {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'respondeu',
          message: classification.replySuppressedReason,
          metadata: classification,
          lastContact: true,
        });
      }
      return;
    }

    const classification = await this.geminiClient.classifyReply({
      leadName: lead.nome,
      courtName: lead.nome_quadra,
      currentStatus: lead.status,
      sentVideo: lead.status === 'video_enviado' || lead.status === 'passar_para_vendas',
      message: incoming.text,
      recentConversation,
      storedSummary,
    });

    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'ia_classificacao',
      mensagem: classification.summary,
      metadados: classification,
    });
    await this.repository.saveConversationSummary(lead.id, classification.conversationSummary);

    if (classification.automatic) {
      return;
    }

    if (classification.stopContact) {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: 'pediu_para_parar',
        message: 'Lead pediu para encerrar o contato.',
        metadata: classification,
        lastContact: true,
      });

      if (isWithinBusinessHours()) {
        await this.evolutionClient.sendText(incoming.phone, stopContactReply);
        await this.repository.createInteraction({
          leadId: lead.id,
          tipo: 'mensagem_enviada',
          mensagem: stopContactReply,
          metadados: { template: 'stop_contact_reply' },
        });
      }
      return;
    }

    if (classification.intent === 'NO_INTEREST') {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: 'sem_interesse',
        message: 'Lead informou que não tem interesse.',
        metadata: classification,
        lastContact: true,
      });

      if (isWithinBusinessHours()) {
        await this.sendNoInterestClosing(lead, incoming.phone, classification);
      }
      return;
    }

    if (classification.intent === 'ALLOW_VIDEO' || classification.allowedVideo) {
      if (isWithinBusinessHours()) {
        await this.sendVideoToLead(lead, incoming.phone, classification);
      } else {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'pediu_video',
          message: 'Lead autorizou envio do vídeo, aguardando horário útil para envio.',
          metadata: classification,
          lastContact: true,
        });
      }
      return;
    }

    if (shouldRouteToHumanHandoff({ lead, classification, storedSummary, latestMessage: incoming.text })) {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: 'passar_para_vendas',
        message: 'Lead qualificado para atendimento humano.',
        metadata: classification,
        lastContact: true,
      });

      if (isWithinBusinessHours()) {
        await this.evolutionClient.sendText(incoming.phone, humanHandoffReply);
        await this.repository.createInteraction({
          leadId: lead.id,
          tipo: 'mensagem_enviada',
          mensagem: humanHandoffReply,
          metadados: { template: 'human_handoff_reply' },
        });
      }

      return;
    }

    if ((classification.intent === 'USES_SYSTEM' || classification.mentionsExistingSystem) && lead.status !== 'usa_sistema') {
      if (isWithinBusinessHours()) {
        await this.sendSystemCounterProposal(lead, classification, incoming.phone);
      } else {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'contra_argumento_sugerido',
          message: 'Lead informou que já usa sistema. Contraproposta pendente para próximo horário útil.',
          metadata: classification,
          lastContact: true,
        });
      }
      return;
    }

    if (!classification.shouldReply) {
      if (shouldMoveToResponded(lead.status)) {
        await this.repository.setStatusWithInteraction({
          leadId: lead.id,
          fromStatus: lead.status,
          toStatus: 'respondeu',
          message: classification.replySuppressedReason || 'Lead respondeu; automação permaneceu em silêncio por contexto.',
          metadata: classification,
          lastContact: true,
        });
      }
      return;
    }

    if (shouldMoveToResponded(lead.status)) {
      await this.repository.setStatusWithInteraction({
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: 'respondeu',
        message: 'Lead respondeu e aguarda análise/handoff.',
        metadata: classification,
        lastContact: true,
      });
    }
  }

  private async sendInitialPitchToLead(
    lead: LeadRecord,
    phoneOverride?: string,
    statusBeforeSend: LeadRecord['status'] = lead.status,
  ) {
    const normalizedPhone = phoneOverride || normalizePhone(lead.telefone);
    if (!normalizedPhone) {
      return;
    }

    if (hasReachedPitchStage(lead.status) || (statusBeforeSend !== 'pitch_pendente' && lead.status !== 'pitch_pendente')) {
      return;
    }

    await this.evolutionClient.sendText(normalizedPhone, initialPitchMessage);
    await this.repository.updateStatus(lead.id, 'mensagem_enviada', {
      lastContact: true,
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'mensagem_enviada',
      mensagem: initialPitchMessage,
      metadados: { channel: 'whatsapp', template: 'initial_pitch', phone: normalizedPhone },
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'status_alterado',
      mensagem: 'Pitch completo enviado após resposta do lead à saudação inicial.',
      statusAnterior: statusBeforeSend,
      statusNovo: 'mensagem_enviada',
      metadados: { phone: normalizedPhone },
    });
  }

  private async sendSystemCounterProposal(
    lead: LeadRecord,
    classification?: ReplyClassification,
    phoneOverride?: string,
  ) {
    const normalizedPhone = phoneOverride || normalizePhone(lead.telefone);
    if (!normalizedPhone) {
      return;
    }

    if (!canSendSystemCounterProposal(lead.status)) {
      return;
    }

    await this.evolutionClient.sendText(normalizedPhone, systemCounterProposal);
    await this.repository.updateStatus(lead.id, 'usa_sistema', {
      lastContact: true,
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'mensagem_enviada',
      mensagem: systemCounterProposal,
      metadados: { template: 'system_counter_proposal', classification },
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'status_alterado',
      mensagem: 'Contraproposta enviada para lead que já usa sistema.',
      statusAnterior: lead.status,
      statusNovo: 'usa_sistema',
      metadados: classification,
    });
  }

  private async sendVideoToLead(lead: LeadRecord, phoneOverride?: string, classification?: ReplyClassification) {
    const normalizedPhone = phoneOverride || normalizePhone(lead.telefone);
    if (!normalizedPhone) {
      return;
    }

    if (hasReachedVideoStage(lead.status) || !canSendVideo(lead.status)) {
      return;
    }

    await this.evolutionClient.sendVideo(normalizedPhone, videoFilePath, videoCaption);
    await this.repository.updateStatus(lead.id, 'video_enviado', {
      lastContact: true,
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'mensagem_enviada',
      mensagem: videoCaption,
      metadados: { template: 'product_video', filePath: videoFilePath, classification },
    });
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'status_alterado',
      mensagem: 'Vídeo enviado ao lead.',
      statusAnterior: lead.status,
      statusNovo: 'video_enviado',
      metadados: classification,
    });
  }

  private async sendNoInterestClosing(
    lead: LeadRecord,
    phoneOverride?: string,
    classification?: ReplyClassification,
  ) {
    const normalizedPhone = phoneOverride || normalizePhone(lead.telefone);
    if (!normalizedPhone) {
      return;
    }

    if (!hasReachedVideoStage(lead.status)) {
      await this.evolutionClient.sendVideo(normalizedPhone, videoFilePath, noInterestVideoCaption);
      await this.repository.createInteraction({
        leadId: lead.id,
        tipo: 'mensagem_enviada',
        mensagem: noInterestVideoCaption,
        metadados: { template: 'product_video_no_interest', filePath: videoFilePath, classification },
      });

      return;
    }

    await this.evolutionClient.sendText(normalizedPhone, noInterestReply);
    await this.repository.createInteraction({
      leadId: lead.id,
      tipo: 'mensagem_enviada',
      mensagem: noInterestReply,
      metadados: { template: 'no_interest_reply', classification },
    });
  }

  private extractIncomingMessages(body: unknown): IncomingLeadMessage[] {
    const payload = body as Record<string, any>;
    const event = String(payload?.event || payload?.type || '').trim();

    if (!event || !event.toLowerCase().includes('message')) {
      return [];
    }

    const data = payload?.data;
    const messages = Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data)
        ? data
        : data?.message
          ? [data]
          : payload?.message
            ? [payload]
            : [];

    return messages
      .map((item: Record<string, any>) => {
        const key = item?.key || item?.message?.key || {};
        const messageBody = item?.message || item?.data?.message || {};
        const remoteJid = String(key.remoteJid || item?.remoteJid || item?.data?.key?.remoteJid || '');
        const fromMe = Boolean(key.fromMe || item?.fromMe);
        const text = this.extractMessageText(messageBody).trim();

        if (!remoteJid || !text) {
          return null;
        }

        return {
          event,
          messageId: String(key.id || item?.id || item?.messageId || item?.data?.key?.id || ''),
          text,
          remoteJid,
          phone: jidToPhone(remoteJid),
          fromMe,
          pushName: item?.pushName || item?.push_name,
          raw: item,
        } satisfies IncomingLeadMessage;
      })
        .filter((item: IncomingLeadMessage | null): item is IncomingLeadMessage => item !== null);
  }

  private extractMessageText(message: Record<string, any>): string {
    return (
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      message?.imageMessage?.caption ||
      message?.videoMessage?.caption ||
      message?.documentMessage?.caption ||
      message?.buttonsResponseMessage?.selectedDisplayText ||
      message?.buttonsResponseMessage?.selectedButtonId ||
      message?.listResponseMessage?.title ||
      message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      message?.templateButtonReplyMessage?.selectedDisplayText ||
      ''
    );
  }
}