# Base image: node:26-alpine, kept current by Dependabot. The app itself needs Node 22+ (package.json engines).
FROM node:26-alpine
WORKDIR /app
RUN apk add --no-cache iproute2 iptables
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY plugins/shipped ./plugins/shipped
COPY fregoli.json ./
COPY .grok ./.grok
RUN mkdir -p plugins/runtime
ARG FREGOLI_VERSION=dev
ENV FREGOLI_VERSION=$FREGOLI_VERSION
ENV FREGOLI_HOST=0.0.0.0
EXPOSE 8080
CMD ["npx", "tsx", "src/cli.ts"]
