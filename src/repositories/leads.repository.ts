import { ResultSetHeader, RowDataPacket } from 'mysql2';

import { pool } from '../lib/db.js';
import { buildPhoneCandidates } from '../lib/phone.js';
import { ConversationTurn, InteractionType, LeadRecord, LeadStatus } from '../types/leads.js';

type LeadRow = LeadRecord & RowDataPacket;
type InteractionRow = RowDataPacket & {
  tipo: InteractionType;
  mensagem: string | null;
  criado_em: Date;
};

type SummaryRow = RowDataPacket & {
  mensagem: string | null;
};

type CountRow = RowDataPacket & {
  total: number;
};

type StatusRow = RowDataPacket & {
  status_novo: string | null;
};

function placeholders(count: number) {
  return new Array(count).fill('?').join(', ');
}

function priorityOrderClause() {
  return "CASE prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END";
}

export class LeadsRepository {
  private async hydrateLeadStatus(lead: LeadRow | null) {
    if (!lead) {
      return null;
    }

    const rawStatus = String(lead.status || '').trim();
    if (rawStatus) {
      return lead;
    }

    const [rows] = await pool.query<StatusRow[]>(
      `
        SELECT status_novo
        FROM lead_interacoes
        WHERE lead_id = ?
          AND tipo = 'status_alterado'
          AND status_novo IS NOT NULL
          AND status_novo <> ''
        ORDER BY id DESC
        LIMIT 1
      `,
      [lead.id],
    );

    const recoveredStatus = (rows[0]?.status_novo?.trim() as LeadStatus | undefined) || 'novo';
    lead.status = recoveredStatus;

    await pool.execute('UPDATE leads SET status = ? WHERE id = ? AND COALESCE(status, "") = ""', [recoveredStatus, lead.id]);

    return lead;
  }

  async findNextInitialLead(statuses: readonly string[]) {
    const [rows] = await pool.query<LeadRow[]>(
      `
        SELECT *
        FROM leads
        WHERE deleted_at IS NULL
          AND COALESCE(NULLIF(status, ''), 'novo') IN (${placeholders(statuses.length)})
        ORDER BY ${priorityOrderClause()} ASC, created ASC
        LIMIT 1
      `,
      [...statuses],
    );

    return this.hydrateLeadStatus(rows[0] ?? null);
  }

  async updateStatusIfCurrent(leadId: number, currentStatus: LeadStatus, nextStatus: LeadStatus) {
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE leads SET status = ? WHERE id = ? AND status = ?',
      [nextStatus, leadId, currentStatus],
    );

    return result.affectedRows > 0;
  }

  async findNextFollowUpLead(statuses: readonly string[]) {
    const [rows] = await pool.query<LeadRow[]>(
      `
        SELECT *
        FROM leads
        WHERE deleted_at IS NULL
          AND status IN (${placeholders(statuses.length)})
        ORDER BY ultimo_contato_em ASC, created ASC
        LIMIT 1
      `,
      [...statuses],
    );

    return this.hydrateLeadStatus(rows[0] ?? null);
  }

  async findByPhone(rawPhone: string) {
    const candidates = buildPhoneCandidates(rawPhone);
    if (candidates.length === 0) {
      return null;
    }

    const [rows] = await pool.query<LeadRow[]>(
      `
        SELECT *
        FROM leads
        WHERE deleted_at IS NULL
          AND REPLACE(REPLACE(REPLACE(REPLACE(telefone, '+', ''), '-', ''), '(', ''), ')', '') IN (${placeholders(
            candidates.length,
          )})
        ORDER BY updated DESC, created DESC
        LIMIT 1
      `,
      candidates,
    );

    return this.hydrateLeadStatus(rows[0] ?? null);
  }

  async updateStatus(leadId: number, status: LeadStatus, metadata?: { firstContact?: boolean; lastContact?: boolean }) {
    const fields = ['status = ?'];
    const values: Array<string | number | null> = [status];

    if (metadata?.firstContact) {
      fields.push('primeiro_contato_em = COALESCE(primeiro_contato_em, NOW())');
    }

    if (metadata?.lastContact) {
      fields.push('ultimo_contato_em = NOW()');
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`,
      [...values, leadId],
    );

    return result.affectedRows > 0;
  }

  async createInteraction(input: {
    leadId: number;
    tipo: InteractionType;
    mensagem?: string | null;
    statusAnterior?: string | null;
    statusNovo?: string | null;
    metadados?: unknown;
  }) {
    await pool.execute(
      `
        INSERT INTO lead_interacoes (lead_id, tipo, mensagem, status_anterior, status_novo, metadados)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        input.leadId,
        input.tipo,
        input.mensagem ?? null,
        input.statusAnterior ?? null,
        input.statusNovo ?? null,
        input.metadados ? JSON.stringify(input.metadados) : null,
      ],
    );
  }

  async hasProcessedIncomingMessage(leadId: number, remoteJid: string, messageId: string) {
    const [rows] = await pool.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM lead_interacoes
        WHERE lead_id = ?
          AND tipo = 'resposta_recebida'
          AND JSON_UNQUOTE(JSON_EXTRACT(metadados, '$.remoteJid')) = ?
          AND JSON_UNQUOTE(JSON_EXTRACT(metadados, '$.messageId')) = ?
      `,
      [leadId, remoteJid, messageId],
    );

    return Number(rows[0]?.total || 0) > 0;
  }

  async getRecentConversationContext(leadId: number, limit = 8): Promise<ConversationTurn[]> {
    const [rows] = await pool.query<InteractionRow[]>(
      `
        SELECT tipo, mensagem, criado_em
        FROM lead_interacoes
        WHERE lead_id = ?
          AND tipo IN ('mensagem_enviada', 'resposta_recebida')
          AND mensagem IS NOT NULL
        ORDER BY id DESC
        LIMIT ?
      `,
      [leadId, limit],
    );

    return rows
      .reverse()
      .map((row) => ({
        role: row.tipo === 'mensagem_enviada' ? ('assistant' as const) : ('lead' as const),
        tipo: row.tipo,
        mensagem: row.mensagem?.trim() || '',
        criadoEm: row.criado_em,
      }))
      .filter((row) => row.mensagem.length > 0);
  }

  async getLatestConversationSummary(leadId: number) {
    const [rows] = await pool.query<SummaryRow[]>(
      `
        SELECT mensagem
        FROM lead_interacoes
        WHERE lead_id = ?
          AND tipo = 'nota'
          AND JSON_UNQUOTE(JSON_EXTRACT(metadados, '$.kind')) = 'conversation_summary'
        ORDER BY id DESC
        LIMIT 1
      `,
      [leadId],
    );

    return rows[0]?.mensagem?.trim() || '';
  }

  async saveConversationSummary(leadId: number, summary: string) {
    const normalizedSummary = summary.trim();
    if (!normalizedSummary) {
      return;
    }

    await this.createInteraction({
      leadId,
      tipo: 'nota',
      mensagem: normalizedSummary,
      metadados: { kind: 'conversation_summary' },
    });
  }

  async setStatusWithInteraction(input: {
    leadId: number;
    fromStatus: LeadStatus;
    toStatus: LeadStatus;
    message?: string | null;
    metadata?: unknown;
    firstContact?: boolean;
    lastContact?: boolean;
  }) {
    await this.updateStatus(input.leadId, input.toStatus, {
      firstContact: input.firstContact,
      lastContact: input.lastContact,
    });

    await this.createInteraction({
      leadId: input.leadId,
      tipo: 'status_alterado',
      mensagem: input.message ?? null,
      statusAnterior: input.fromStatus,
      statusNovo: input.toStatus,
      metadados: input.metadata,
    });
  }
}