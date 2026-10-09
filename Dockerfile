FROM node:24-slim AS build
ENV CI=true
RUN npm install -g pnpm@12.8.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN rm -rf node_modules packages/*/node_modules \
  && pnpm install --prod --frozen-lockfile --offline

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/prototype/dist ./prototype/dist
USER node
EXPOSE 3000
CMD ["node", "packages/server/dist/main.js"]
