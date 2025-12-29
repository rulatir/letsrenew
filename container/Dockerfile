FROM oven-sh/bun:latest

# Install ssh client and openssl
RUN apt-get update && apt-get install -y openssh-client openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
COPY config.example.yml ./
COPY agent ./agent
COPY container/etc/letsrenew /etc/letsrenew

# Install deps
RUN bun install --production

# Build TypeScript
RUN bun x tsc -p tsconfig.json

# Default entrypoint runs the CLI; container may be run with different command for admin tasks
CMD ["bun", "./dist/cli.js"]

