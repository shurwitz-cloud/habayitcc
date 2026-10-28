import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  async headers() {
    return [
      {
        // Keep HTML fresh after admin photo saves (phones were seeing stale heroes).
        source: '/((?!_next/static|_next/image|photos/|flyers/|favicon|api/).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' }],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/st', destination: '/events/register/simchat-torah' },
      { source: '/ST', destination: '/events/register/simchat-torah' },
      { source: '/simchattorah', destination: '/events/register/simchat-torah' },
      { source: '/simchat-torah', destination: '/events/register/simchat-torah' },
      { source: '/zugot', destination: '/events/register/erev-zugot' },
      { source: '/erev-zugot', destination: '/events/register/erev-zugot' },
      { source: '/erevzugot', destination: '/events/register/erev-zugot' },
    ];
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'habayitcc.com' }],
        destination: 'https://www.habayitcc.org/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.habayitcc.com' }],
        destination: 'https://www.habayitcc.org/:path*',
        permanent: true,
      },
      { source: '/hebrew-school', destination: '/hebrew-adventure', permanent: true },
      { source: '/hebrew-school/register', destination: '/hebrew-adventure/register', permanent: true },
      { source: '/bat-mitzvah', destination: '/bloom', permanent: true },
      { source: '/rsvp/hebrew-adventure-aug4', destination: '/rsvp/hebrew-adventure', permanent: true },
      { source: '/rsvp/achim-jul28', destination: '/rsvp/achim', permanent: true },
      { source: '/rsvp/bmx-aug13', destination: '/rsvp/bmx', permanent: true },
      { source: '/rsvp/bloom-aug6', destination: '/rsvp/bloom', permanent: true },
      {
        source: '/senior-home-permission',
        destination: '/achim/senior-home-permission',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
