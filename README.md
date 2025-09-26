# Print Zebra Service

Serviço Fastify para impressão de PDFs ou etiquetas Zebra (ZPL) em impressoras locais ou de rede (porta 9100). Inclui fila de impressão, detecção de impressora Zebra e envio direto de ZPL.

## Requisitos
- Node.js 20+ (para desenvolvimento local)
- Docker (para deploy recomendado)
- Impressora Zebra em rede (ex: IP 192.168.x.x porta 9100) ou impressora instalada no sistema operacional

## Variáveis
Atualmente a porta é fixa no código (3333 internamente), mas usamos Docker para expor 9999. Ajuste se quiser unificar.

## Rotas Principais
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /health | Status básico |
| GET | /printers | Lista impressoras do sistema (pdf-to-printer) |
| GET | /printer-status | Estado das impressoras monitoradas |
| POST | /print | Envia upload (multipart) PDF para fila |
| POST | /print-from-url | Baixa PDF via URL e imprime |
| POST | /print-ip | Envia ZPL ou PDF diretamente para IP (porta 9100) |

### /print-ip (direto por IP)
Body JSON (exemplos):
```json
{ "ip": "192.168.15.249", "zpl": "^XA^FO30,30^ADN,36,20^FDTeste^FS^XZ" }
```
Ou:
```json
{ "ip": "192.168.15.249", "pdfUrl": "https://exemplo.com/etiqueta.pdf" }
```
Campos:
- ip (obrigatório)
- zpl ou pdfUrl (um deles)
- type opcional ("zpl" ou "pdf") se quiser forçar

### Observações PDF -> IP
Se sua Zebra não interpreta PDF nativamente, o resultado será incorreto. Para label printing use ZPL.

## Build e Run com Docker
### Build
```bash
docker build -t print-zebra:latest .
```
### Run (porta 9999 externa -> 9999 interna)
```bash
docker run -d --name print-zebra -p 9999:9999 print-zebra:latest
```
Ver logs:
```bash
docker logs -f print-zebra
```
Teste health:
```bash
curl http://localhost:9999/health
```
Enviar ZPL:
```bash
curl -X POST http://localhost:9999/print-ip -H 'Content-Type: application/json' \
  -d '{"ip":"192.168.15.249","zpl":"^XA^FO30,30^ADN,36,20^FDHello^FS^XZ"}'
```

## Deploy em EC2
1. Conecte via SSH na instância.
2. Instale Docker (se não tiver) e adicione seu user ao grupo docker.
3. Copie o repositório (git clone) ou use pipeline CI/CD.
4. `docker build -t print-zebra:prod .`
5. `docker run -d --restart=always --name print-zebra -p 9999:9999 print-zebra:prod`
6. Ajuste security group liberando porta 9999 somente para IPs necessários.

## Segurança Recomendada (não implementado ainda)
- Token simples (API Key via header) para /print*, /print-ip
- Rate limiting (@fastify/rate-limit)
- Lista branca de IP ou VPN para acesso
- Logs centralizados (ELK / CloudWatch)

## Próximos Passos Possíveis
- Converter PDF -> ZPL (rasterização) para impressoras que não suportam PDF
- Atualizar para usar variável de ambiente PORT
- Adicionar autenticação
- Persistir histórico de jobs

## Licença
Uso interno.
