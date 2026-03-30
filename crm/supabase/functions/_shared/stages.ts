export const STAGES = {
  PRIMEIRO_CONTATO:    1,
  AGENDAMENTO_REUNIAO: 2,
  REUNIAO_AGENDADA:    3,
  ENVIO_PROPOSTA:      4,
  GANHO:               5,
  PERDIDO:             6,
} as const;

export const STAGE_NAMES: Record<number, string> = {
  1: 'Primeiro contato',
  2: 'Agendamento de reunião',
  3: 'Reunião agendada',
  4: 'Envio de proposta',
  5: 'Ganho',
  6: 'Perdido',
};
