import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const productionDirectory = dirname(fileURLToPath(import.meta.url));
const readArtifact = (name) =>
  readFileSync(join(productionDirectory, name), 'utf8');

const compose = readArtifact('compose.yml');
const environment = readArtifact('production.env.example');
const maintenance = readArtifact('nginx-maintenance.conf');
const reportOnly = readArtifact('nginx-report-only.conf');
const production = readArtifact('nginx-production.conf');
const apiDockerfile = readFileSync(
  join(productionDirectory, '../../../apps/api/Dockerfile'),
  'utf8',
);

const serviceNames = [
  'postgres',
  'migrate',
  'seed',
  'api',
  'web',
  'nginx',
  'certbot',
];

function serviceBlock(name) {
  const marker = `  ${name}:\n`;
  const start = compose.indexOf(marker);
  assert.notEqual(start, -1, `missing Compose service: ${name}`);

  const body = compose.slice(start + marker.length);
  const nextService = body.search(/\n  [a-z][a-z0-9-]*:\n/);
  return nextService === -1 ? body : body.slice(0, nextService);
}

function portsBlock(service) {
  return service.match(
    /\n    ports:\n([\s\S]*?)(?=\n    [a-z][a-z0-9-]*:|\s*$)/,
  )?.[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const csp =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; manifest-src 'self'";

test('requires immutable API and web images without build instructions', () => {
  assert.equal(
    compose.match(/image:\s+\$\{API_IMAGE:\?API_IMAGE is required\}/g)
      ?.length,
    3,
  );
  assert.match(compose, /image:\s+\$\{WEB_IMAGE:\?WEB_IMAGE is required\}/);
  assert.doesNotMatch(compose, /^\s*build:/m);
  assert.doesNotMatch(
    compose,
    /image:\s+\S+:(?:latest|main|master)(?:\s|$)/im,
  );
  assert.match(environment, /^API_IMAGE=.*@sha256:[0-9a-f]{64}$/m);
  assert.match(environment, /^WEB_IMAGE=.*@sha256:[0-9a-f]{64}$/m);
});

test('keeps PostgreSQL on the private network with persistent storage', () => {
  const postgres = serviceBlock('postgres');

  assert.match(postgres, /image:\s+postgres:16-alpine/);
  assert.match(postgres, /postgres_data:\/var\/lib\/postgresql\/data/);
  assert.match(postgres, /networks:\s*\n\s+- backend/);
  assert.doesNotMatch(postgres, /- edge/);
  assert.match(compose, /^  postgres_data:\s*$/m);
  assert.match(compose, /^  backend:\s*\n\s+internal:\s*true/m);
});

test('publishes only the Nginx edge ports', () => {
  const publishedServices = serviceNames.filter((name) =>
    portsBlock(serviceBlock(name)),
  );

  assert.deepEqual(publishedServices, ['nginx']);

  const nginxPorts = portsBlock(serviceBlock('nginx'));
  assert.match(nginxPorts, /80:80/);
  assert.match(nginxPorts, /443:443/);
  for (const forbiddenPort of ['22', '3000', '3001', '5432']) {
    assert.doesNotMatch(nginxPorts, new RegExp(`(?:^|:)${forbiddenPort}(?::|$)`));
  }
});

test('hardens the API, web, and Nginx containers', () => {
  for (const name of ['api', 'web', 'nginx']) {
    const service = serviceBlock(name);
    assert.match(service, /read_only:\s*true/);
    assert.match(service, /no-new-privileges:true/);
  }
});

test('runs the generated Nest API entrypoint', () => {
  assert.match(serviceBlock('api'), /apps\/api\/dist\/src\/main\.js/);
  assert.match(apiDockerfile, /CMD \["node", "apps\/api\/dist\/src\/main\.js"\]/);
});

test('defines production service dependencies, healthchecks, networks, and volumes', () => {
  for (const name of ['postgres', 'api', 'web', 'nginx']) {
    assert.match(serviceBlock(name), /healthcheck:/, `${name} needs a healthcheck`);
  }

  assert.match(serviceBlock('nginx'), /nginx:1\.28-alpine/);
  assert.match(
    serviceBlock('nginx'),
    /\$\{NGINX_CONFIG_FILE:\?NGINX_CONFIG_FILE is required\}:\/etc\/nginx\/nginx\.conf:ro/,
  );
  assert.match(serviceBlock('nginx'), /certbot_etc:\/etc\/letsencrypt:ro/);
  assert.match(serviceBlock('nginx'), /certbot_webroot:\/var\/www\/certbot:ro/);

  const certbot = serviceBlock('certbot');
  assert.match(certbot, /image:\s+certbot\/certbot:v4\.2\.0/);
  assert.match(certbot, /profiles:\s*\n\s+- operations/);
  assert.match(certbot, /certbot_etc:\/etc\/letsencrypt/);
  assert.match(certbot, /certbot_webroot:\/var\/www\/certbot/);

  assert.match(compose, /^  certbot_etc:\s*$/m);
  assert.match(compose, /^  certbot_webroot:\s*$/m);
  assert.match(compose, /^  edge:\s*$/m);
});

test('keeps the public API URL as a web image build-time contract', () => {
  const web = serviceBlock('web');

  assert.doesNotMatch(web, /NEXT_PUBLIC_API_URL/);
  assert.match(environment, /^NEXT_PUBLIC_API_URL=\/api$/m);
});

test('pins production runtime security settings in Compose and the env example', () => {
  const api = serviceBlock('api');

  assert.match(api, /NODE_ENV:\s+production/);
  assert.match(api, /COOKIE_SECURE:\s+['"]?true['"]?/);
  assert.match(api, /COOKIE_SAME_SITE:\s+['"]?lax['"]?/);
  assert.match(api, /SWAGGER_ENABLED:\s+['"]?false['"]?/);

  assert.match(environment, /^FRONTEND_URL=https:\/\/gameficacao\.semcomp\.com\.br$/m);
  assert.match(environment, /^COOKIE_SECURE=true$/m);
  assert.match(environment, /^COOKIE_SAME_SITE=lax$/m);
  assert.match(environment, /^NODE_ENV=production$/m);
  assert.match(environment, /^SWAGGER_ENABLED=false$/m);
});

test('serves maintenance health and ACME while returning 503 for other requests', () => {
  assert.match(maintenance, /location\s*=\s*\/nginx-health[\s\S]*?return\s+200/);
  assert.match(
    maintenance,
    /location\s+\^~\s+\/\.well-known\/acme-challenge\/[\s\S]*?\/var\/www\/certbot/,
  );
  assert.match(maintenance, /location\s+\/\s*\{[\s\S]*?return\s+503/);
});

test('uses report-only CSP without enabling enforcement', () => {
  assert.match(reportOnly, /add_header\s+Content-Security-Policy-Report-Only\b/);
  assert.doesNotMatch(
    reportOnly,
    /add_header\s+Content-Security-Policy(?:\s|['"])/,
  );
  assert.match(reportOnly, new RegExp(escapeRegExp(csp)));
});

test('uses enforcement CSP, TLS, and required browser security headers in production', () => {
  assert.match(production, /add_header\s+Content-Security-Policy\b/);
  assert.match(production, new RegExp(escapeRegExp(csp)));
  assert.match(production, /add_header\s+Strict-Transport-Security\s+['"]max-age=31536000; includeSubDomains['"]/);
  assert.match(
    production,
    /add_header\s+Permissions-Policy\s+['"]geolocation=\(\), microphone=\(\), camera=\(self\)['"]?/,
  );

  for (const config of [reportOnly, production]) {
    assert.match(config, /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3/);
    assert.match(
      config,
      /ssl_certificate\s+\/etc\/letsencrypt\/live\/gameficacao\.semcomp\.com\.br\/fullchain\.pem/,
    );
    assert.match(
      config,
      /ssl_certificate_key\s+\/etc\/letsencrypt\/live\/gameficacao\.semcomp\.com\.br\/privkey\.pem/,
    );
    assert.match(config, /X-Frame-Options\s+['"]DENY['"]/);
    assert.match(config, /X-Content-Type-Options\s+['"]nosniff['"]/);
    assert.match(config, /Referrer-Policy\s+['"]strict-origin-when-cross-origin['"]/);
    assert.match(
      config,
      /add_header\s+Strict-Transport-Security\s+['"]max-age=31536000; includeSubDomains['"]/,
    );
    assert.match(
      config,
      /add_header\s+Permissions-Policy\s+['"]geolocation=\(\), microphone=\(\), camera=\(self\)['"]?/,
    );
    assert.doesNotMatch(config, /unsafe-eval/);
    assert.doesNotMatch(config, /preload/);
  }
});

test('redirects final HTTP traffic while preserving ACME and proxies trusted paths', () => {
  for (const config of [reportOnly, production]) {
    assert.match(config, /listen\s+80/);
    assert.match(
      config,
      /location\s+\^~\s+\/\.well-known\/acme-challenge\/[\s\S]*?\/var\/www\/certbot/,
    );
    assert.match(config, /return\s+301\s+https:\/\/\$host\$request_uri/);
    assert.match(config, /proxy_set_header\s+X-Forwarded-For\s+\$remote_addr;/);
    assert.match(config, /location\s+\/api\/[\s\S]*?proxy_pass\s+http:\/\/api:3001\//);
    assert.match(config, /location\s+\/[\s\S]*?proxy_pass\s+http:\/\/web:3000/);
    assert.match(config, /camera=\(self\)/);
  }
});
