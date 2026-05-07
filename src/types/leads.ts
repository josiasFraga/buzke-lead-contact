export const leadStatuses = [
  'novo',
  'capturado',
  'validado',
  'sem_whatsapp',
  'abordagem_pendente',
  'mensagem_enviada',
  'saudacao_enviada',
  'respondeu',
  'pediu_video',
  'video_enviado',
  'usa_sistema',
  'contra_argumento_sugerido',
  'passar_para_vendas',
  'sem_interesse',
  'pediu_para_parar',
  'numero_invalido',
  'erro',
  'contato_iniciado',
  'pitch_pendente',
  'perdido',
  'convertido',
] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const terminalLeadStatuses = new Set<LeadStatus>([
  'passar_para_vendas',
  'sem_interesse',
  'pediu_para_parar',
  'convertido',
  'perdido',
]);

export const initialQueueStatuses = ['novo', 'capturado', 'validado', 'abordagem_pendente'] as const satisfies readonly LeadStatus[];

export const followUpQueueStatuses = ['pediu_video', 'contra_argumento_sugerido', 'pitch_pendente'] as const satisfies readonly LeadStatus[];

export type InteractionType =
  | 'lead_criado'
  | 'status_alterado'
  | 'mensagem_sugerida'
  | 'mensagem_enviada'
  | 'resposta_recebida'
  | 'nota'
  | 'erro'
  | 'ia_classificacao';

export interface ConversationTurn {
  role: 'assistant' | 'lead';
  tipo: InteractionType;
  mensagem: string;
  criadoEm: Date;
}

export interface LeadRecord {
  id: number;
  nome: string;
  nome_quadra: string;
  telefone: string | null;
  email: string | null;
  canal: string | null;
  primeiro_contato_em: Date | null;
  ultimo_contato_em: Date | null;
  status: LeadStatus;
  score: number;
  cliente_id: number | null;
  instagram: string | null;
  modalidades: string | null;
  obsercacao: string | null;
  fonte_url: string | null;
  abordagem: string | null;
  cidade: string | null;
  estado: string | null;
  prioridade: 'alta' | 'media' | 'baixa';
}

export interface IncomingLeadMessage {
  event: string;
  messageId: string;
  messageIds?: string[];
  text: string;
  remoteJid: string;
  phone: string;
  fromMe: boolean;
  pushName?: string;
  raw: unknown;
}

export type ReplyIntent =
  | 'AUTO_MESSAGE'
  | 'USES_SYSTEM'
  | 'ALLOW_VIDEO'
  | 'INTERESTED'
  | 'ASK_PRICE'
  | 'WANT_TRIAL'
  | 'NO_INTEREST'
  | 'STOP'
  | 'OTHER';

export interface ReplyClassification {
  intent: ReplyIntent;
  confidence: number;
  summary: string;
  conversationSummary: string;
  mentionsExistingSystem: boolean;
  allowedVideo: boolean;
  interested: boolean;
  stopContact: boolean;
  automatic: boolean;
  shouldReply: boolean;
  replySuppressedReason: string;
}