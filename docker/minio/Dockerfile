# fork ver：MinIO 社区版自建镜像
#
# 背景：MinIO 社区版进入维护模式后关闭了全部公开分发渠道——
#   - Docker Hub 的 minio/minio 已撤库
#   - quay.io/minio/minio 匿名拉取 unauthorized
#   - dl.min.io 服务器二进制 410 Gone
#   - GitHub release 仅剩源码包
# 唯一活着的源头是 GitHub 源码 tag，故从源码自建并推送 GHCR 自管供应链。
#
# 构建上下文约定：由 docker-minio.yml 下载 minio 源码 tar.gz 解压后，
# 将本文件复制进源码根目录作为 Dockerfile 使用（context = 源码目录）。
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && mkdir -p /data
COPY --from=build /out/minio /usr/local/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
