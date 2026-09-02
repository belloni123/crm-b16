# Rollback — Omnichannel Foundation

A migration é aditiva, mas o rollback de banco não deve remover tabelas ou colunas automaticamente.

1. Pause worker e scheduler de staging.
2. Mantenha todas as flags `false` e o kill switch `true`.
3. Faça rollback apenas da imagem/commit da aplicação para o commit anterior da branch.
4. Preserve PostgreSQL e Redis para investigação.
5. Não execute `DROP`, não restaure backup sobre o staging atual e não aplique rollback em produção.
6. Se for necessário recriar staging, crie banco/Redis novos e descarte o ambiente antigo somente após guardar evidências técnicas.

Como nenhum fluxo atual depende dos novos campos, o código anterior ignora a estrutura aditiva. Produção não recebeu esta migration.
