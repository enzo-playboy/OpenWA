import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DAILY_QUOTA_PER_CHIP as PIPELINE_QUOTA } from '../safety-guardrails.agent';

/**
 * The scripts-side daily chip quota must stay in lockstep with the pipeline guardrail: both
 * enforce 40 dispatches/chip/day, and every script that adopts lib-chip-quota adds to the SAME
 * persisted counter (data/chip-daily-quota.json), so the sum of the day protects the chip.
 */
interface ChipQuota {
  DAILY_QUOTA_PER_CHIP: number;
  usedToday(sessionId: string): number;
  canDispatch(sessionId: string): boolean;
  recordDispatch(sessionId: string): number;
}

const requireFromRoot = createRequire(__filename);

describe('lib-chip-quota (scripts) — quota diária por chip', () => {
  const dataFile = path.join(__dirname, '..', '..', '..', '..', 'data', 'chip-daily-quota.json');
  const originalContent = fs.existsSync(dataFile) ? fs.readFileSync(dataFile, 'utf8') : null;
  let quota: ChipQuota;

  beforeEach(() => {
    // Isola o arquivo de estado real em um tmpdir apontando o cwd relativo do módulo.
    const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-quota-'));
    // A lib resolve data/ a partir de __dirname; reescrevemos o arquivo real com estado vazio
    // e restauramos no finally. (Caminho gitignored: data/.)
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, '{}');
    quota = requireFromRoot(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'lib-chip-quota.js')) as ChipQuota;
    void tmpData;
  });

  afterAll(() => {
    if (originalContent === null) {
      try {
        fs.rmSync(dataFile);
      } catch {
        // best-effort cleanup
      }
    } else {
      fs.writeFileSync(dataFile, originalContent);
    }
  });

  it('usa a mesma quota do guardrail do pipeline (40/dia)', () => {
    expect(quota.DAILY_QUOTA_PER_CHIP).toBe(PIPELINE_QUOTA);
    expect(PIPELINE_QUOTA).toBe(40);
  });

  it('conta envios por chip e bloqueia ao atingir a quota', () => {
    const chip = 'quota-test-chip';
    expect(quota.canDispatch(chip)).toBe(true);
    for (let i = 0; i < quota.DAILY_QUOTA_PER_CHIP; i++) {
      expect(quota.canDispatch(chip)).toBe(true);
      quota.recordDispatch(chip);
    }
    expect(quota.usedToday(chip)).toBe(quota.DAILY_QUOTA_PER_CHIP);
    expect(quota.canDispatch(chip)).toBe(false); // bloqueia o 41º
  });

  it('contadores são independentes por chip', () => {
    const chipA = 'chip-a';
    const chipB = 'chip-b';
    quota.recordDispatch(chipA);
    quota.recordDispatch(chipA);
    quota.recordDispatch(chipB);
    expect(quota.usedToday(chipA)).toBe(2);
    expect(quota.usedToday(chipB)).toBe(1);
  });

  it('persiste o estado em data/chip-daily-quota.json (sobrevive a reinício do processo)', () => {
    const chip = 'persist-test-chip';
    quota.recordDispatch(chip);
    quota.recordDispatch(chip);

    // Simula um novo processo relendo o arquivo do disco.
    const state = JSON.parse(fs.readFileSync(dataFile, 'utf8')) as Record<string, { count: number }>;
    expect(state[chip].count).toBe(2);
  });

  it('um "reboot" da lib (novo require) mantém a contagem do dia', () => {
    const chip = 'reload-test-chip';
    quota.recordDispatch(chip);

    // Novo require = novo módulo em memória, mesmo arquivo em disco.
    delete require.cache[path.join(__dirname, '..', '..', '..', '..', 'scripts', 'lib-chip-quota.js')];
    const reloaded = requireFromRoot(
      path.join(__dirname, '..', '..', '..', '..', 'scripts', 'lib-chip-quota.js'),
    ) as ChipQuota;
    expect(reloaded.usedToday(chip)).toBe(1);
  });
});

describe('roteamento de chips por nicho (AGENTS.md, regra 3)', () => {
  const runMondaySource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'scripts', 'run-monday-full-automation.js'),
    'utf8',
  );

  it('run-monday usa os dois chips exclusivos corretos', () => {
    expect(runMondaySource).toContain("'764ba619-c986-4b7b-bea8-fa67c2845b01'"); // chip-2-iphone (ouro)
    expect(runMondaySource).toContain("'84e58e30-9c99-4eb5-8e27-c6604778d1cd'"); // suportew (agro)
    expect(runMondaySource).toContain('resolveChipForLead');
  });

  it('run-monday consulta a quota antes de disparar e registra após enviar', () => {
    expect(runMondaySource).toContain('canDispatch(');
    expect(runMondaySource).toContain('recordDispatch(');
  });

  it('mensagens por nicho: agro não recebe texto de joalheria e vice-versa', () => {
    expect(runMondaySource).toContain('empresas de irrigação');
    expect(runMondaySource).toContain('Pesquisei por joalherias');
  });

  it('TODOS os scripts de disparo consultam a quota compartilhada (toque2, toque3, custom)', () => {
    for (const file of ['send-followup-toque2.js', 'send-followup-toque3.js', 'send-followup-custom.js']) {
      const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'scripts', file), 'utf8');
      expect(source).toContain("require('./lib-chip-quota')");
      expect(source).toContain('canDispatch(');
      expect(source).toContain('recordDispatch(');
    }
  });
});
