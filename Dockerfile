# Base image: node:26-alpine, kept current by Dependabot. The app itself needs Node 22+ (package.json engines).
FROM node:26-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY LICENSE THIRD_PARTY_NOTICES.md ./
EXPOSE 8080
CMD ["npx", "tsx", "src/cli.ts"]
