import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { containsCollection, endsWithQuestion } from '../content-rules';

/**
 * Shape of scripts/production-messages.js (loaded via require below). Keeping the messages in a
 * shared module lets these tests validate the EXACT production texts against the SDR training
 * rules (content-rules.ts) without running the scripts or touching WhatsApp/Supabase.
 */
interface ProductionMessages {
  INTERVALO_MINIMO_MS: number;
  JITTER_MAXIMO_MS: number;
  PROTECTED_PHONES: string[];
  GANCHOS_TOQUE2: string[];
  normalizePhone(phone: unknown): string;
  firstNameOf(name: unknown): string;
  buildToque2Message(lead: { name?: string | null } | null | undefined): string;
  buildToque3Message(lead: { name?: string | null } | null | undefined): string;
}

const scriptsDir = path.join(__dirname, '..', '..', '..', '..', 'scripts');

const requireFromRoot = createRequire(__filename);
const production = requireFromRoot(path.join(scriptsDir, 'production-messages.js')) as ProductionMessages;

/** Markdown, links e abreviações informais são proibidos em toda mensagem (treinamento, Regra 3). */
const CONTENT_VIOLATIONS = /\*\*|https?:\/\/|\b(vc|blz|obg|vlw|tmj)\b/i;

const leads: Array<{ name?: string | null }> = [
  { name: 'Maria Souza' },
  { name: 'josé' },
  { name: 'João da Silva' },
  { name: '' },
  { name: null },
  {},
];

describe('Mensagens de produção dos follow-ups (scripts/) vs treinamento SDR', () => {
  it('Toque 2: termina com pergunta, sem cobrança e com primeiro nome (Regras 2, 5 e 7)', () => {
    for (const lead of leads) {
      const text = production.buildToque2Message(lead);
      expect(endsWithQuestion(text)).toBe(true);
      expect(containsCollection(text)).toBe(false);
      expect(text.length).toBeLessThanOrEqual(600);
      expect(text).not.toMatch(CONTENT_VIOLATIONS);
      // Primeiro contato/follow-up frio nunca oferece áudio (Regra 1).
      expect(text).not.toMatch(/áudio|audio/i);
      if (lead.name) expect(text).toContain(production.firstNameOf(lead.name));
    }
  });

  it('Toque 2: todas as combinações saudação x gancho passam nas regras duras', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const text = production.buildToque2Message({ name: 'Maria Souza' });
      expect(endsWithQuestion(text)).toBe(true);
      expect(containsCollection(text)).toBe(false);
      const gancho = text.split('\n\n')[1];
      if (gancho) vistos.add(gancho);
    }
    // Cobertura: com 60 sorteios, os 3 ganchos precisam ter aparecido.
    expect([...vistos].sort()).toEqual([...production.GANCHOS_TOQUE2].sort());
  });

  it('Toque 3 (break-up): termina com pergunta, sem cobrança e com primeiro nome', () => {
    for (const lead of leads) {
      const text = production.buildToque3Message(lead);
      expect(endsWithQuestion(text)).toBe(true);
      expect(containsCollection(text)).toBe(false);
      expect(text).not.toMatch(CONTENT_VIOLATIONS);
      if (lead.name) expect(text).toContain(production.firstNameOf(lead.name));
    }
  });

  it('cada gancho do Toque 2, isoladamente, passa nas duas regras duras', () => {
    for (const gancho of production.GANCHOS_TOQUE2) {
      expect(endsWithQuestion(gancho)).toBe(true);
      expect(containsCollection(gancho)).toBe(false);
    }
  });
});

describe('Conformidade AGENTS.md nos scripts de disparo', () => {
  it('intervalo mínimo entre envios é de 6 minutos no mesmo chip (regra 2)', () => {
    expect(production.INTERVALO_MINIMO_MS).toBe(360_000);
    expect(production.JITTER_MAXIMO_MS).toBeGreaterThanOrEqual(0);
    expect(production.JITTER_MAXIMO_MS).toBeLessThanOrEqual(60_000);
  });

  it('telefones sob atendimento manual estão protegidos (regra 4)', () => {
    expect(production.PROTECTED_PHONES).toContain('5511981381228');
    expect(production.PROTECTED_PHONES).toContain('5511930539183');
    for (const phone of production.PROTECTED_PHONES) {
      expect(phone).toMatch(/^\d+$/); // já normalizados, mesma forma usada no envio
    }
  });

  it('normalizePhone deixa só dígitos (mesma regra dos agentes em src/)', () => {
    expect(production.normalizePhone('+55 11 98138-1228')).toBe('5511981381228');
    expect(production.normalizePhone('')).toBe('');
    expect(production.normalizePhone(undefined)).toBe('');
  });

  it('scripts de toque 2 e 3 consomem a fonte única (sem mensagens inline antigas)', () => {
    for (const file of ['send-followup-toque2.js', 'send-followup-toque3.js']) {
      const source = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
      expect(source).toContain("require('./production-messages')");
      // A mensagem de cobrança antiga não pode voltar em nenhum script (Regra 5).
      expect(source).not.toContain('Conseguiu ver a mensagem anterior');
      // O delay antigo de 5-10s (risco de ban) não pode voltar (regra 2 do AGENTS.md).
      expect(source).not.toMatch(/setTimeout\(r,\s*5000/);
    }
  });

  it('scripts de resposta em conversa ativa usam delay de 1-2 min (rigor anti-ban)', () => {
    for (const file of ['fix-active-conversations.js', 'reply-active-leads.js', 'sweep-and-reply-all-chats.js']) {
      const source = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
      expect(source).toMatch(/setTimeout\(r,\s*60_000/); // piso de 1 min presente
      // Delays curtos antigos não podem voltar.
      expect(source).not.toMatch(/setTimeout\(r,\s*[345]000\)/);
    }
  });
});
