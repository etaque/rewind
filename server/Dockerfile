FROM rust:1.85-slim AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates sqlite3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/rewind /usr/local/bin/rewind

EXPOSE 8080

CMD ["rewind", "http", "0.0.0.0:8080"]
