import { Injectable } from '@nestjs/common';
import { createLogger } from '../services/logger.service';

export interface LeadData {
  id?: string;
  phone: string;
  name?: string;
  email?: string;
  status?: string;
  metadata?: Record<string, any>;
}

export interface BreachIncidentDetails {
  source: string;
  compromisedFields: string[];
  affectedRecordsCount: number;
  detectedAt?: Date;
}

@Injectable()
export class LgpdComplianceService {
  private readonly logger = createLogger('LgpdComplianceService');

  /**
   * LGPD Art. 17 - Direito ao Esquecimento / Anonymização de Leads
   * Mascara e destrói dados de identificação pessoal (PII).
   */
  anonymizeLeadData(lead: LeadData): LeadData {
    this.logger.warn(`[LGPD Art. 17] Anonymizing PII for lead ${lead.phone || lead.id}...`);

    return {
      ...lead,
      phone: '00000000000',
      name: '[DELETED_LGPD_ART_17]',
      email: 'deleted@lgpd.anonymized',
      status: 'lgpd_anonymized',
      metadata: {
        anonymized: true,
        anonymized_at: new Date().toISOString(),
        reason: 'LGPD Art. 17 - Right to be forgotten',
      },
    };
  }

  /**
   * LGPD Art. 17 - Processa a solicitação de exclusão com protocolo de 15 dias.
   */
  processDeletionRequest(leadId: string): {
    status: string;
    leadId: string;
    willBeDeletedAt: string;
  } {
    const deletionDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    this.logger.log(`[LGPD Deletion Scheduled] Lead ${leadId} agendado para expurgo em ${deletionDate.toISOString()}`);

    return {
      status: 'deletion_requested',
      leadId,
      willBeDeletedAt: deletionDate.toISOString(),
    };
  }

  /**
   * LGPD Art. 48 - Protocolo de Notificação de Incidente de Segurança (Data Breach)
   */
  initiateBreachProtocol(incident: BreachIncidentDetails): {
    status: string;
    anpdNotificationDeadline: string;
    userNotificationDeadline: string;
    incidentReport: BreachIncidentDetails;
  } {
    const now = incident.detectedAt || new Date();
    const anpdDeadline = new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1h ANPD
    const userDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h Usuários

    this.logger.error(
      `🚨 [LGPD Art. 48 DATA BREACH] ${incident.affectedRecordsCount} registros afetados. Origem: ${incident.source}`,
    );

    return {
      status: 'BREACH_PROTOCOL_INITIATED',
      anpdNotificationDeadline: anpdDeadline.toISOString(),
      userNotificationDeadline: userDeadline.toISOString(),
      incidentReport: {
        ...incident,
        detectedAt: now,
      },
    };
  }
}
