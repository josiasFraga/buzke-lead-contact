import { GoogleGenAI, Type } from '@google/genai';

import { env } from '../config/env.js';
import { ConversationTurn, ReplyClassification } from '../types/leads.js';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ['AUTO_MESSAGE', 'USES_SYSTEM', 'ALLOW_VIDEO', 'INTERESTED', 'ASK_PRICE', 'WANT_TRIAL', 'NO_INTEREST', 'STOP', 'OTHER'],
    },
    confidence: { type: Type.NUMBER },
    summary: { type: Type.STRING },
    conversationSummary: { type: Type.STRING },
    mentionsExistingSystem: { type: Type.BOOLEAN },
    allowedVideo: { type: Type.BOOLEAN },
    interested: { type: Type.BOOLEAN },
    stopContact: { type: Type.BOOLEAN },
    automatic: { type: Type.BOOLEAN },
    shouldReply: { type: Type.BOOLEAN },
    replySuppressedReason: { type: Type.STRING },
  },
  required: ['intent', 'confidence', 'summary', 'conversationSummary', 'mentionsExistingSystem', 'allowedVideo', 'interested', 'stopContact', 'automatic', 'shouldReply', 'replySuppressedReason'],
};

export class GeminiClient {
  private readonly client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }

  async classifyReply(input: {
    leadName: string;
    courtName: string;
    currentStatus: string;
    sentVideo: boolean;
    message: string;
    recentConversation: ConversationTurn[];
    storedSummary: string;
  }): Promise<ReplyClassification> {
    const conversationHistory = input.recentConversation.length
      ? input.recentConversation
          .map((turn) => `${turn.role === 'assistant' ? 'Buzke' : 'Lead'}: ${turn.mensagem}`)
          .join('\n')
      : 'Sem historico recente registrado.';

    const prompt = [
      'Você classifica respostas de leads para um SDR automatizado da Buzke.',
      'Retorne apenas JSON válido seguindo o schema fornecido.',
      'Categorias:',
      'AUTO_MESSAGE: mensagem automática, ausência, bot, menu, auto reply, horário de atendimento, resposta genérica automática.',
      'USES_SYSTEM: o lead informou explicitamente que já usa sistema, software, app, plataforma ou ERP concorrente.',
      'ALLOW_VIDEO: o lead autorizou o envio do vídeo.',
      'INTERESTED: o lead demonstrou interesse claro no produto.',
      'ASK_PRICE: perguntou preço, plano, mensalidade, valor.',
      'WANT_TRIAL: pediu teste, demo, acesso ou apresentação.',
      'NO_INTEREST: disse que não tem interesse.',
      'STOP: pediu para parar contato, remover número, não chamar novamente.',
      'OTHER: qualquer outra resposta.',
      'Nao marque USES_SYSTEM apenas porque a resposta foi enviada depois de uma pergunta sobre o sistema atual.',
      'Respostas curtas como "atende bem", "sim", "nao", "mais ou menos" ou "funciona" sem citar explicitamente sistema, software, app, plataforma ou ERP devem ser OTHER, INTERESTED ou NO_INTEREST conforme o conteudo.',
      'Use o historico recente para entender o contexto antes de decidir.',
      'conversationSummary deve ser um resumo acumulado e atualizado da conversa em 1 a 3 frases curtas.',
      'Esse resumo deve preservar fatos importantes: interesse, falta de interesse, pedido de video, pedido para parar, se ja usa sistema, se gostou do sistema atual, e qual o ultimo ponto aberto da conversa.',
      'shouldReply indica se a automacao deve enviar uma nova mensagem agora.',
      'Marque shouldReply como false quando a melhor acao for ficar em silencio: agradecimentos, confirmacoes curtas, respostas de encerramento, sinal de que o assunto acabou, ou quando o lead ja respondeu a pergunta atual e nao faz sentido insistir.',
      'Se o status atual ja for usa_sistema e o lead responder algo como "atende bem", "funciona bem" ou equivalente, marque shouldReply como false.',
      'Quando o lead demonstrar interesse claro, pedir preco, pedir teste ou pedir o video, classifique isso normalmente mesmo que a resposta seja curta.',
      'Considere como automático mensagens do tipo: estou em reunião, mensagem automática, resposta automática, horário de atendimento, menu de opções, selecione uma opção, olá seja bem-vindo, sou assistente virtual.',
      'Contexto do lead:',
      `Nome: ${input.leadName}`,
      `Quadra: ${input.courtName}`,
      `Status atual: ${input.currentStatus}`,
      `Vídeo já enviado: ${input.sentVideo ? 'sim' : 'não'}`,
      `Resumo acumulado atual: ${input.storedSummary || 'Sem resumo salvo.'}`,
      'Historico recente da conversa:',
      conversationHistory,
      `Mensagem do lead: ${input.message}`,
    ].join('\n');

    const response = await this.client.models.generateContent({
      model: env.geminiModel,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.1,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Gemini retornou resposta vazia');
    }

    return JSON.parse(text) as ReplyClassification;
  }
}