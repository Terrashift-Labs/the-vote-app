# TheVoteApp — Disaster Recovery Runbook

**Version:** 1.0 | **Owner:** Deployment team | **RTO:** 4 hours | **RPO:** 24 hours

---

## 1. Service Architecture Summary

| Component | State | Recovery mechanism |
| --- | --- | --- |
| Blockchain contracts | Immutable on-chain | Not recoverable (by design) — redeploy only if chain is abandoned |
| Policy / country configs | IPFS + git | Restore from IPFS backup CID or git clone |
| Backend API (Express) | Stateless | Redeploy from Docker image; restore DB from IPFS backup |
| IPFS documents | Content-addressed | Re-pin from backup manifest CID |
| Push notification tokens | Ephemeral | Re-register on next app launch — no manual recovery needed |
| Mobile apps | App stores | Re-download; keys stored in device Secure Enclave (non-recoverable by design) |

---

## 2. Backup Procedure

Run daily via cron:

```bash
# 1. Snapshot backend state to IPFS
MANIFEST_CID=$(npx tsx backend/scripts/backup.ts)
echo "Backup manifest CID: $MANIFEST_CID"

# 2. Pin to a remote pinning service (Pinata example)
curl -X POST https://api.pinata.cloud/pinning/pinByHash \
  -H "Authorization: Bearer $PINATA_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"hashToPin\": \"$MANIFEST_CID\"}"

# 3. Store CID in a durable location (git, ENS text record, etc.)
echo "$MANIFEST_CID" >> backup-history.log
```

---

## 3. Recovery Procedures

### 3.1 Backend API down

```bash
# Check health
curl https://api.thevoteapp.org/api/v1/health/deep

# Redeploy from last known-good Docker image
docker pull thevoteapp/api:latest
docker run -d --env-file .env.prod -p 3000:3000 thevoteapp/api:latest

# Verify
curl https://api.thevoteapp.org/api/v1/health
```

### 3.2 IPFS node unreachable

```bash
# Switch to a public gateway in .env
IPFS_GATEWAY_URL=https://cloudflare-ipfs.com/ipfs/

# Re-initialise the Helia node
npx tsx backend/scripts/restore-ipfs.ts --manifest-cid <CID>
```

### 3.3 Blockchain RPC down

```bash
# Update RPC_URL in .env to a fallback provider
RPC_URL=https://sepolia.infura.io/v3/<BACKUP_KEY>

# Restart backend
pm2 restart thevoteapp-api
```

### 3.4 Smart contract exploit — emergency pause

```bash
# Any 3 of the 5 guardians must call:
#   PauseGuardian.proposePause("exploit description")
#   PauseGuardian.approvePause(<proposalId>)   ← 2 more guardians
#   PauseGuardian.executePause(<proposalId>)

# Using the CLI:
npx hardhat run scripts/pause.ts --network mainnet
```

### 3.5 Full infrastructure loss

1. Clone the repository: `git clone https://github.com/TheVoteApp/the-vote-app`
2. Fetch latest backup manifest CID from `backup-history.log` or ENS text record
3. Restore country configs: `npx tsx backend/scripts/restore-ipfs.ts --manifest-cid <CID>`
4. Deploy contracts: `npx hardhat run scripts/deploy-l2.ts --network optimismSepolia`
5. Update `.env.prod` with new contract addresses
6. Deploy backend: `npm run deploy:prod`
7. Publish new gateway manifest: `npx tsx backend/scripts/publish-gateway.ts`
8. Update ENS text record with new CID

---

## 4. Health Check Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | Liveness — process alive |
| `GET /api/v1/health/deep` | Readiness — blockchain RPC + IPFS connected |

Expected deep check response (healthy):

```json
{
  "status": "healthy",
  "checks": {
    "blockchain": { "ok": true, "latencyMs": 45 },
    "ipfs":       { "ok": true, "latencyMs": 120 },
    "memory":     { "ok": true, "latencyMs": 87 }
  }
}
```

---

## 5. Contacts

| Role | Contact |
| --- | --- |
| On-call engineer | PagerDuty rotation |
| Pause guardian keys | 5 keyholders — contact list in secure vault |
| IPFS pinning | Pinata dashboard |
| Domain / ENS | ENS app — thevoteapp.eth |
