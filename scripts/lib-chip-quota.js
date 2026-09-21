/**
 * Quota diária por chip (AGENTS.md + SafetyGuardrailsAgent.DAILY_QUOTA_PER_CHIP = 40).
 *
 * Contador persistido em data/chip-daily-quota.json (gitignored) para sobreviver a reinícios
 * e acumular entre TODOS os scripts que o adotarem — a soma do dia é o que protege o chip.
 * O dia usa o mesmo dayKey UTC (YYYY-MM-DD) do guardrail em src/modules/ai-agents/.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'chip-daily-quota.json');

/** Quota diária por chip — igual à constante do SafetyGuardrailsAgent. */
const DAILY_QUOTA_PER_CHIP = 40;

const dayKey = () => new Date().toISOString().slice(0, 10);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Envios já registrados hoje para o chip (0 quando o dia virou). */
function usedToday(sessionId) {
  const entry = readState()[sessionId];
  return entry && entry.day === dayKey() ? entry.count : 0;
}

/** True quando o chip ainda tem quota hoje. */
function canDispatch(sessionId) {
  return usedToday(sessionId) < DAILY_QUOTA_PER_CHIP;
}

/** Registra 1 envio e retorna o total do dia. Best-effort: falha de disco não derruba o disparo. */
function recordDispatch(sessionId) {
  try {
    const state = readState();
    const current = usedToday(sessionId);
    state[sessionId] = { day: dayKey(), count: current + 1 };
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    return state[sessionId].count;
  } catch {
    return usedToday(sessionId);
  }
}

module.exports = { DAILY_QUOTA_PER_CHIP, usedToday, canDispatch, recordDispatch };
