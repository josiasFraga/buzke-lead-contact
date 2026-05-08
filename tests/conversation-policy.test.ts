import test from 'node:test';
import assert from 'node:assert/strict';

import { detectConversationHeuristic, shouldRouteToHumanHandoff } from '../src/lib/conversation-policy.ts';
import { LeadRecord, ReplyClassification } from '../src/types/leads.ts';

function buildLead(status: LeadRecord['status']): LeadRecord {
  return {
    id: 1,
    nome: 'Lead Teste',
    nome_quadra: 'Quadra Teste',
    telefone: '5551999999999',
    email: null,
    canal: null,
    primeiro_contato_em: null,
    ultimo_contato_em: null,
    status,
    score: 0,
    cliente_id: null,
    instagram: null,
    modalidades: null,
    obsercacao: null,
    fonte_url: null,
    abordagem: null,
    cidade: null,
    estado: null,
    prioridade: 'media',
  };
}

function buildClassification(overrides: Partial<ReplyClassification> = {}): ReplyClassification {
  return {
    intent: 'OTHER',
    confidence: 0.9,
    summary: 'Resumo',
    conversationSummary: 'Resumo acumulado',
    mentionsExistingSystem: false,
    allowedVideo: false,
    interested: false,
    stopContact: false,
    automatic: false,
    shouldReply: false,
    replySuppressedReason: 'Sem resposta',
    ...overrides,
  };
}

test('heuristica pos-video reconhece ack e silencia', () => {
  const result = detectConversationHeuristic('Vou assistir depois', buildLead('video_enviado'));

  assert.ok(result);
  assert.equal(result.shouldReply, false);
  assert.match(result.replySuppressedReason, /aguardar/i);
});

test('heuristica pos-objeção detecta dor e marca interesse', () => {
  const result = detectConversationHeuristic('Hoje sobra muita coisa manual', buildLead('usa_sistema'));

  assert.ok(result);
  assert.equal(result.intent, 'INTERESTED');
  assert.equal(result.interested, true);
  assert.equal(result.shouldReply, true);
});

test('heuristica apos pitch reconhece autorizacao curta para video', () => {
  const result = detectConversationHeuristic('Pode', buildLead('mensagem_enviada'));

  assert.ok(result);
  assert.equal(result.intent, 'ALLOW_VIDEO');
  assert.equal(result.allowedVideo, true);
  assert.equal(result.shouldReply, true);
});

test('heuristica apos pitch reconhece ok como autorizacao para video', () => {
  const result = detectConversationHeuristic('Ok', buildLead('mensagem_enviada'));

  assert.ok(result);
  assert.equal(result.intent, 'ALLOW_VIDEO');
  assert.equal(result.allowedVideo, true);
  assert.equal(result.shouldReply, true);
});

test('heuristica apos pitch reconhece manda ai como autorizacao para video', () => {
  const result = detectConversationHeuristic('Manda aí', buildLead('mensagem_enviada'));

  assert.ok(result);
  assert.equal(result.intent, 'ALLOW_VIDEO');
  assert.equal(result.allowedVideo, true);
  assert.equal(result.shouldReply, true);
});

test('heuristica apos pitch reconhece pode ser como autorizacao para video', () => {
  const result = detectConversationHeuristic('Pode ser', buildLead('mensagem_enviada'));

  assert.ok(result);
  assert.equal(result.intent, 'ALLOW_VIDEO');
  assert.equal(result.allowedVideo, true);
  assert.equal(result.shouldReply, true);
});

test('heuristica de encerramento curto silencia', () => {
  const result = detectConversationHeuristic('Obrigado', buildLead('mensagem_enviada'));

  assert.ok(result);
  assert.equal(result.shouldReply, false);
  assert.match(result.summary, /encerramento/i);
});

test('heuristica trata boa tarde como saudacao curta', () => {
  const result = detectConversationHeuristic('Boa tarde', buildLead('mensagem_enviada'));

  assert.ok(result);
  assert.equal(result.shouldReply, false);
  assert.match(result.summary, /saudação|saudacao/i);
});

test('handoff reconhece interesse pós-video pelo resumo acumulado', () => {
  const result = shouldRouteToHumanHandoff({
    lead: buildLead('video_enviado'),
    classification: buildClassification({ conversationSummary: 'Lead gostou do vídeo e quer entender melhor.' }),
    storedSummary: 'Recebeu o vídeo.',
    latestMessage: 'Legal',
  });

  assert.equal(result, true);
});

test('handoff reconhece objeção com dor operacional pelo resumo', () => {
  const result = shouldRouteToHumanHandoff({
    lead: buildLead('usa_sistema'),
    classification: buildClassification({ conversationSummary: 'Lead relatou que o sistema atual dá trabalho e sobra coisa manual.' }),
    storedSummary: '',
    latestMessage: 'Mais ou menos',
  });

  assert.equal(result, true);
});

test('handoff nao dispara sem sinais fortes', () => {
  const result = shouldRouteToHumanHandoff({
    lead: buildLead('video_enviado'),
    classification: buildClassification({ conversationSummary: 'Lead recebeu o vídeo e vai olhar depois.' }),
    storedSummary: '',
    latestMessage: 'Vou ver depois',
  });

  assert.equal(result, false);
});

test('handoff nao dispara com saudacao curta isolada', () => {
  const result = shouldRouteToHumanHandoff({
    lead: buildLead('video_enviado'),
    classification: buildClassification({
      intent: 'INTERESTED',
      shouldReply: true,
      conversationSummary: 'Lead mandou apenas uma saudação curta.',
    }),
    storedSummary: '',
    latestMessage: 'Boa tarde',
  });

  assert.equal(result, false);
});