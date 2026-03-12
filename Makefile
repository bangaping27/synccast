BINARY  := synccast
CMD     := ./cmd/server
GOFLAGS := -ldflags="-s -w"

.PHONY: run build tidy test lint docker-up docker-down clean

## run: start the server in development mode (requires Redis)
run:
	go run $(CMD)/main.go

## build: compile a production binary
build:
	go build $(GOFLAGS) -o bin/$(BINARY) $(CMD)/main.go

## tidy: download & clean up module dependencies
tidy:
	go mod tidy

## test: run all tests with race detector
test:
	go test -race -count=1 ./...

## lint: run golangci-lint (install separately)
lint:
	golangci-lint run ./...

## docker-up: spin up Redis + SyncCast via docker-compose
docker-up:
	docker compose up --build -d

## docker-down: tear down containers
docker-down:
	docker compose down

## clean: remove compiled binary
clean:
	rm -rf bin/
