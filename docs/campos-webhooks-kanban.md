# Campos personalizados, webhooks e Kanban

## Campos personalizados

Em **Configurações → Campos personalizados**, administradores podem criar e editar rótulo, nome interno, tipo, ajuda, valor padrão, obrigatoriedade, opções e regras de mínimo/máximo/padrão. Campos podem ser pausados, reativados, reordenados ou arquivados.

Arquivar não exclui os valores existentes. O nome interno é a chave estável usada por integrações. Alterar o tipo é bloqueado quando o campo já possui valores.

Tipos: texto, texto longo, número, moeda, data, data/hora, telefone, e-mail, URL, seleção única, seleção múltipla, checkbox e booleano.

## Webhooks

Em **Configurações → Webhooks**, escolha Entrada para manter o fluxo atual de criação/deduplicação de leads ou Saída para notificar sistemas externos.

Webhooks de saída permitem:

- eventos de criação, atualização e mudança de etapa;
- `POST`, `PUT` ou `PATCH`;
- timeout entre 1 e 30 segundos;
- campos padrão, campos personalizados e valores estáticos;
- chaves renomeadas, ordem e obrigatoriedade;
- preview, teste, pausa, edição, arquivamento e reenvio de falhas;
- headers JSON criptografados em repouso.

URLs locais, credenciais embutidas e endereços privados são rejeitados. Respostas são limitadas antes de entrar no log. Segredos de headers nunca retornam para a interface; ao editar, deixe o campo vazio para preservá-los.

## Ordem das etapas

Em **Configurações → Funis e etapas**, arraste uma etapa ou use os botões de subir/descer. A interface aplica a ordem imediatamente e reverte se o servidor rejeitar a operação. O servidor valida que a lista contém exatamente as etapas daquele pipeline e atualiza apenas `order` em transação.

A operação não apaga nem recria etapas, portanto preserva IDs, leads, histórico e integrações existentes.
