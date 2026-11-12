---
impacto: nada_mudou
secao: corrigido
titulo: A configuração da VPS da Estallo gera a chave de cifra no formato que o app lê
---

O `scripts/estallo-vps.py configure` gerava a `AI_CRED_AES_KEY` em hexadecimal, e o app só aceita 32 bytes em base64. Por isso guardar a chave de cobrança, a chave de IA própria da empresa ou outra credencial cifrada falhava com "Configure a chave de cifra do servidor". O script corrige só instalações novas; quem já está instalado troca o valor do `runtime.env` uma vez. A tela de Conexão também deixa de dizer que a Stripe aceita boleto: a assinatura é só no cartão.
