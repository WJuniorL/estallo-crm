---
impacto: capacidade_nova
secao: adicionado
titulo: Mensagem agendada no Inbox — escreva agora, envie no horário escolhido
---

O composer do Inbox ganhou um relógio ao lado do emoji. Ele abre "Agendar mensagem", com três sugestões (em 1 hora, amanhã de manhã, próxima segunda) e data e hora livres; o horário escolhido aparece acima do campo, e o Enviar passa a agendar. No fio da conversa a mensagem agendada aparece num balão próprio, tracejado e com o horário, e clicar nele permite editar o texto ou o horário, ou cancelar o envio. No horário, o envio sai pelo mesmo caminho do envio manual, como o atendente que agendou; se não puder sair (janela de 24h fechada, canal fora do ar, autor fora da equipe), o balão mostra o motivo e a Central recebe um aviso, e nada é reenviado sozinho. Só texto nesta versão. A anonimização LGPD zera o texto e cancela as agendadas do titular. Banco: migration 0720 (tabela `scheduled_messages`) e um cron novo de 1 minuto no `scheduler`, os dois aplicados pelo `update.sh` sem ação do operador.
