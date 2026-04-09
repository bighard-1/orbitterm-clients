FROM ubuntu:22.04

ARG NODE_MAJOR=24
ARG RUST_TOOLCHAIN=stable
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  file \
  git \
  gnupg \
  libasound2-dev \
  libatk1.0-dev \
  libcairo2-dev \
  libdbus-1-dev \
  libgdk-pixbuf-2.0-dev \
  libglib2.0-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  libjavascriptcoregtk-4.1-dev \
  libpango1.0-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libssl-dev \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  libxcb-shape0-dev \
  libxcb-xfixes0-dev \
  patchelf \
  pkg-config \
  python3 \
  unzip \
  xz-utils \
  build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && npm i -g npm@latest \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash builder
WORKDIR /workspace
USER builder

ENV PATH="/home/builder/.cargo/bin:${PATH}"

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal --default-toolchain "${RUST_TOOLCHAIN}"
RUN rustup target add x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu
