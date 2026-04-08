import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    workerThreads: false,
  },
  serverExternalPackages: ['pg', '@paypal/paypal-server-sdk', 'openai', 'bcryptjs'],
};

export default nextConfig;
