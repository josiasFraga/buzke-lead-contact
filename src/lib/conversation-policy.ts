import { LeadRecord, ReplyClassification } from '../types/leads.js';

function normalizeHeuristicText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function includesAny(text: string, patterns: readonly string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

type HeuristicActionConfig = {
  intent?: ReplyClassification['intent'];
  confidence?: number;
  summary: string | ((message: string) => string);
  conversationSummary: string | ((message: string) => string);
  mentionsExistingSystem?: boolean;
  allowedVideo?: boolean;
  interested?: boolean;
  stopContact?: boolean;
  automatic?: boolean;
  shouldReply?: boolean;
  replySuppressedReason?: string | ((message: string) => string);
};

type HeuristicRule = {
  statuses: Array<LeadRecord['status'] | '*'>;
  patterns: readonly string[];
  action: HeuristicActionConfig;
};

function resolveActionField(field: string | ((message: string) => string), message: string) {
  return typeof field === 'function' ? field(message) : field;
}

function buildHeuristicClassification(input: HeuristicActionConfig, message: string): ReplyClassification {
  return {
    intent: input.intent ?? 'OTHER',
    confidence: input.confidence ?? 0.98,
    summary: resolveActionField(input.summary, message),
    conversationSummary: resolveActionField(input.conversationSummary, message),
    mentionsExistingSystem: input.mentionsExistingSystem ?? false,
    allowedVideo: input.allowedVideo ?? false,
    interested: input.interested ?? false,
    stopContact: input.stopContact ?? false,
    automatic: input.automatic ?? false,
    shouldReply: input.shouldReply ?? false,
    replySuppressedReason: input.replySuppressedReason
      ? resolveActionField(input.replySuppressedReason, message)
      : resolveActionField(input.summary, message),
  };
}

const globalHeuristicRules: HeuristicRule[] = [
  {
    statuses: ['*'],
    patterns: ['nao precisa mandar', 'não precisa mandar', 'pode parar', 'pare de mandar', 'nao chama mais', 'não chama mais', 'nao me chama', 'não me chama', 'remova meu numero', 'remova meu número'],
    action: {
      intent: 'STOP',
      summary: 'Pedido de encerramento detectado por heurística.',
      conversationSummary: 'Lead pediu para interromper o contato automático.',
      stopContact: true,
      replySuppressedReason: 'Pedido de encerramento detectado por heurística.',
    },
  },
  {
    statuses: ['*'],
    patterns: ['sem interesse', 'nao tenho interesse', 'não tenho interesse', 'nao me interessa', 'não me interessa', 'agora nao', 'agora não', 'mais pra frente', 'depois vejo', 'deixa quieto'],
    action: {
      intent: 'NO_INTEREST',
      summary: 'Falta de interesse detectada por heurística.',
      conversationSummary: (message) => `Lead sinalizou falta de interesse com a mensagem "${message}".`,
      replySuppressedReason: 'Falta de interesse detectada por heurística.',
    },
  },
];

const statusHeuristicMatrix: HeuristicRule[] = [
  {
    statuses: ['mensagem_enviada'],
    patterns: ['pode mandar', 'pode sim', 'manda sim', 'pode', 'sim', 'claro', 'manda'],
    action: {
      intent: 'ALLOW_VIDEO',
      summary: 'Autorização de envio do vídeo detectada por heurística.',
      conversationSummary: 'Lead autorizou o envio do vídeo e a automação deve enviar o material.',
      allowedVideo: true,
      shouldReply: true,
      replySuppressedReason: '',
    },
  },
  {
    statuses: ['*'],
    patterns: ['obrigado', 'obrigada', 'valeu', 'show', 'fechado', 'tranquilo', 'beleza', 'perfeito', 'top', 'ok', 'blz'],
    action: {
      summary: 'Resposta curta de encerramento detectada por heurística.',
      conversationSummary: (message) => `Lead encerrou de forma breve com "${message}". Sem nova resposta automática.`,
      replySuppressedReason: 'Resposta curta de encerramento detectada por heurística.',
    },
  },
  {
    statuses: ['video_enviado'],
    patterns: ['vou ver', 'vou assistir', 'depois vejo', 'assistirei', 'olho depois', 'vou olhar'],
    action: {
      summary: 'Resposta de baixa ação após envio do vídeo detectada por heurística.',
      conversationSummary: 'Lead recebeu o vídeo e disse que vai assistir depois. Automação deve aguardar novo sinal do lead.',
      replySuppressedReason: 'Lead apenas acusou recebimento do vídeo; automação deve aguardar.',
    },
  },
  {
    statuses: ['video_enviado'],
    patterns: ['gostei', 'achei interessante', 'quero entender melhor', 'como funciona', 'me passa valor', 'me passa os valores', 'qual valor', 'quanto custa', 'tem teste', 'tem demo', 'podemos conversar'],
    action: {
      intent: 'INTERESTED',
      summary: 'Interesse pós-vídeo detectado por heurística.',
      conversationSummary: 'Lead demonstrou interesse após assistir ou receber o vídeo e merece handoff humano.',
      interested: true,
      shouldReply: true,
      replySuppressedReason: '',
    },
  },
  {
    statuses: ['usa_sistema', 'contra_argumento_sugerido'],
    patterns: ['atende bem', 'funciona bem', 'nao sobra nada manual', 'não sobra nada manual', 'esta servindo bem', 'está servindo bem', 'ta servindo bem', 'estamos bem assim'],
    action: {
      summary: 'Lead confirmou que o sistema atual está atendendo bem; sem insistência adicional.',
      conversationSummary: 'Lead informou que o sistema atual atende bem e não abriu dor concreta. Automação deve encerrar esse ramo.',
      mentionsExistingSystem: true,
      replySuppressedReason: 'Lead confirmou satisfação com o sistema atual.',
    },
  },
  {
    statuses: ['usa_sistema', 'contra_argumento_sugerido'],
    patterns: ['sobra coisa manual', 'muita coisa manual', 'da trabalho', 'dá trabalho', 'nao atende bem', 'não atende bem', 'mais ou menos', 'falta coisa', 'poderia ser melhor'],
    action: {
      intent: 'INTERESTED',
      summary: 'Dor operacional após objeção detectada por heurística.',
      conversationSummary: 'Lead já usa sistema, mas relatou dor operacional ou processo manual. Deve ir para handoff humano.',
      mentionsExistingSystem: true,
      interested: true,
      shouldReply: true,
      replySuppressedReason: '',
    },
  },
];

const handoffPolicy = {
  immediateIntents: ['INTERESTED', 'ASK_PRICE', 'WANT_TRIAL'] as const,
  anyStagePatterns: ['preco', 'preço', 'valor', 'valores', 'mensalidade', 'teste', 'demo', 'apresentacao', 'apresentação'] as const,
  stagePatterns: {
    video_enviado: ['quer saber mais', 'quer entender melhor', 'gostou', 'gostei', 'interesse', 'interessado', 'podemos conversar', 'vamos falar', 'me chama'] as const,
    contra_argumento_sugerido: ['muita coisa manual', 'sobra coisa manual', 'nao atende bem', 'não atende bem', 'mais ou menos', 'poderia ser melhor', 'falta coisa', 'da trabalho', 'dá trabalho'] as const,
    usa_sistema: ['muita coisa manual', 'sobra coisa manual', 'nao atende bem', 'não atende bem', 'mais ou menos', 'poderia ser melhor', 'falta coisa', 'da trabalho', 'dá trabalho'] as const,
  },
} as const;

export function detectConversationHeuristic(text: string, lead: LeadRecord): ReplyClassification | null {
  const normalized = normalizeHeuristicText(text);

  for (const rule of [...globalHeuristicRules, ...statusHeuristicMatrix]) {
    const statusMatches = rule.statuses.includes('*') || rule.statuses.includes(lead.status);
    if (statusMatches && includesAny(normalized, rule.patterns)) {
      return buildHeuristicClassification(rule.action, text);
    }
  }

  return null;
}

export function normalizeConversationText(text: string) {
  return normalizeHeuristicText(text);
}

export function summaryIncludesAny(summary: string, patterns: readonly string[]) {
  return includesAny(normalizeHeuristicText(summary), patterns);
}

export function shouldRouteToHumanHandoff(input: {
  lead: LeadRecord;
  classification: ReplyClassification;
  storedSummary: string;
  latestMessage: string;
}) {
  const normalizedSummary = normalizeHeuristicText(`${input.storedSummary} ${input.classification.conversationSummary}`);
  const normalizedMessage = normalizeHeuristicText(input.latestMessage);

  if ((handoffPolicy.immediateIntents as readonly ReplyClassification['intent'][]).includes(input.classification.intent)) {
    return true;
  }

  if (includesAny(normalizedMessage, handoffPolicy.anyStagePatterns) || includesAny(normalizedSummary, handoffPolicy.anyStagePatterns)) {
    return true;
  }

  const stagePatterns = handoffPolicy.stagePatterns[input.lead.status as keyof typeof handoffPolicy.stagePatterns];
  if (!stagePatterns) {
    return false;
  }

  if (input.lead.status === 'video_enviado') {
    return input.classification.interested || includesAny(normalizedMessage, stagePatterns) || includesAny(normalizedSummary, stagePatterns);
  }

  return includesAny(normalizedSummary, stagePatterns);
}