export const STAGES = {
  NOVO_LEAD:        1,
  PRIMEIRO_CONTATO: 2,
  QUALIFICACAO:     3,
  APRESENTACAO:     4,
  PROPOSTA_ENVIADA: 5,
  NEGOCIACAO:       6,
  GANHO:            7,
  PERDIDO:          8,
} as const;

export const STAGE_NAMES: Record<number, string> = {
  1: 'Novo Lead',
  2: 'Primeiro Contato',
  3: 'Qualificação',
  4: 'Apresentação',
  5: 'Proposta Enviada',
  6: 'Negociação',
  7: 'Ganho 🏆',
  8: 'Perdido ❌',
};
