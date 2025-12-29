FROM oven-sh/bun:latest

# Install ssh client and openssl
RUN apt-get update && apt-get install -y openssh-client openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY config.example.yml ./
COPY agent ./agent
# Note: runtime config /etc/letsrenew is expected to be mounted by the operator

# Install deps
RUN bun install --production

# Bun runs TypeScript at runtime; no separate tsc build step is required

# Default entrypoint runs the CLI
CMD ["bun", "src/cli.ts"]
