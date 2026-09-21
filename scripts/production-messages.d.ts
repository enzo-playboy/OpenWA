/** Tipos para scripts/production-messages.js (consumido por specs TypeScript em src/). */
export declare const INTERVALO_MINIMO_MS: number;
export declare const JITTER_MAXIMO_MS: number;
export declare const PROTECTED_PHONES: string[];
export declare const GANCHOS_TOQUE2: string[];

export declare function normalizePhone(phone: unknown): string;
export declare function firstNameOf(name: unknown): string;

/** Shape mínimo de lead que os construtores de mensagem consomem. */
export interface ProductionLead {
  name?: string | null;
}

export declare function buildToque2Message(lead: ProductionLead | null | undefined): string;
export declare function buildToque3Message(lead: ProductionLead | null | undefined): string;
