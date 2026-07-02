import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/hebrew-school', destination: '/hebrew-adventure', permanent: true },
      { source: '/hebrew-school/register', destination: '/hebrew-adventure/register', permanent: true },
      { source: '/rsvp/hebrew-adventure-aug4', destination: '/rsvp/hebrew-adventure', permanent: true },
      { source: '/rsvp/achim-jul28', destination: '/rsvp/achim', permanent: true },
      { source: '/rsvp/bloom-aug6', destination: '/rsvp/bloom', permanent: true },
    ];
  },
};

export default nextConfig;
