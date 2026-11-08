import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://chattquisitions.com',
  output: 'server',
  adapter: netlify(),
  devToolbar: { enabled: false },
});
