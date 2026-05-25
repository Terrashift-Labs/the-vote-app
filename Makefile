# ──────────────────────────────────────────────────────────────────────────────
# TheVoteApp — Developer Makefile
#
# Prerequisites: Docker Desktop 4.x+, Node.js 20+, JDK 17+, Xcode 15+ (macOS)
# ──────────────────────────────────────────────────────────────────────────────

.PHONY: dev down logs restart \
        test test-backend test-blockchain test-android \
        deploy-local clean

## ── Local dev environment ─────────────────────────────────────────────────

# Build images (if needed) and start all services in the background
dev:
	docker compose up --build -d
	@echo ""
	@echo "  Backend API:  http://localhost:3000"
	@echo "  Grafana:      http://localhost:3001  (admin / admin)"
	@echo "  Prometheus:   http://localhost:9090"
	@echo "  IPFS gateway: http://localhost:8080"
	@echo "  Hardhat RPC:  http://localhost:8545  (chainId 31337)"
	@echo ""
	@echo "Run 'make logs' to tail all service logs."

# Stop and remove containers, networks (volumes preserved)
down:
	docker compose down

# Tail logs for all services (Ctrl-C to stop)
logs:
	docker compose logs -f

# Restart a specific service: make restart svc=backend
restart:
	docker compose restart $(svc)

## ── Tests ─────────────────────────────────────────────────────────────────

test: test-backend test-blockchain

test-backend:
	cd backend && npm test

test-blockchain:
	cd blockchain && npx hardhat test

test-android:
	cd android && ./gradlew test

## ── Deploy contracts to local Hardhat node ───────────────────────────────

deploy-local:
	cd blockchain && npx hardhat run scripts/deploy.ts --network localhost

## ── Clean ─────────────────────────────────────────────────────────────────

# Stop containers AND delete volumes (full reset)
clean:
	docker compose down -v
	@echo "All containers and volumes removed."
