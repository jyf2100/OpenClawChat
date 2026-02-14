# 阶段1: 构建
FROM docker.1ms.run/node:20-alpine AS builder

# 配置代理（构建时通过 --build-arg 传入）
ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}

WORKDIR /app
COPY package*.json ./
# 删除 lock 文件避免跨平台依赖问题
RUN rm -f package-lock.json && npm install
COPY . .
RUN npm run build

# 阶段2: 运行
FROM docker.1ms.run/nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
