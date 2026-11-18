import { afterEach, describe, expect, it, vi } from 'vitest';

// Config and the mailer are set up at import, so each case re-imports them with different variables.
const KEYS = ['NODE_ENV', 'BREVO_API_KEY', 'SMTP_HOST', 'EMAIL_FROM'];
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

async function load(env) {
  Object.assign(process.env, env);
  vi.resetModules();
  return import('../src/email.js');
}

afterEach(() => {
  Object.assign(process.env, original);
  vi.unstubAllGlobals();
});

describe('sending verification emails through the Brevo HTTPS API', () => {
  it('posts the message to Brevo with the API key, sender, recipient, subject and text', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: '<1@relay>' }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const { mailer } = await load({ BREVO_API_KEY: 'test-brevo-key', EMAIL_FROM: 'CampusBazaar <team@example.com>' });

    await mailer.send({ to: 'priya@uni.test', subject: 'Verify your CampusBazaar account', text: 'Open this link:\nhttps://x.test/a?b=1&c=2' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(options.method).toBe('POST');
    expect(options.headers['api-key']).toBe('test-brevo-key');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      sender: { name: 'CampusBazaar', email: 'team@example.com' },
      to: [{ email: 'priya@uni.test' }],
      subject: 'Verify your CampusBazaar account',
      textContent: 'Open this link:\nhttps://x.test/a?b=1&c=2',
    });
    // The HTML copy is escaped, so text from the message can never inject markup.
    expect(body.htmlContent).toBe('<p>Open this link:<br>https://x.test/a?b=1&amp;c=2</p>');
  });

  it('fails loudly when Brevo refuses the message (e.g. unverified sender)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"unauthorized","message":"sender not valid"}', { status: 400 })));
    const { mailer } = await load({ BREVO_API_KEY: 'test-brevo-key', EMAIL_FROM: 'team@example.com' });
    await expect(mailer.send({ to: 'priya@uni.test', subject: 's', text: 't' })).rejects.toThrow(/Brevo email API returned 400: .*sender not valid/);
  });

  it('does not use Brevo when no API key is set', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { mailer } = await load({ BREVO_API_KEY: '', SMTP_HOST: '' });
    await mailer.send({ to: 'priya@uni.test', subject: 's', text: 't' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('sender address parsing', () => {
  it('reads "Name <address>", quoted names and bare addresses', async () => {
    const { parseSender } = await load({});
    expect(parseSender('CampusBazaar <team@example.com>')).toEqual({ name: 'CampusBazaar', email: 'team@example.com' });
    expect(parseSender('"Campus Bazaar" <team@example.com>')).toEqual({ name: 'Campus Bazaar', email: 'team@example.com' });
    expect(parseSender(' team@example.com ')).toEqual({ email: 'team@example.com' });
    expect(parseSender('"CampusBazaar <team@example.com>"')).toEqual({ name: 'CampusBazaar', email: 'team@example.com' });
  });
});

describe('production email setting', () => {
  it('refuses to start in production with neither BREVO_API_KEY nor SMTP_HOST', async () => {
    await expect(load({ NODE_ENV: 'production', BREVO_API_KEY: '', SMTP_HOST: '' })).rejects.toThrow('BREVO_API_KEY or SMTP_HOST is required');
  });

  it('starts in production with only BREVO_API_KEY', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mailer } = await load({ NODE_ENV: 'production', BREVO_API_KEY: 'test-brevo-key', SMTP_HOST: '' });
    expect(mailer).toBeDefined();
  });
});
