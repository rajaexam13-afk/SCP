dev:
	@test -f .env || cp .env.example .env
	docker-compose up -d
	@echo ""
	@echo "✓ DemandIQ is running"
	@echo "  UI  → http://localhost:3000"
	@echo "  API → http://localhost:8000/docs"

down:
	docker-compose down

logs:
	docker-compose logs -f

reset:
	docker-compose down -v
	docker-compose up -d
