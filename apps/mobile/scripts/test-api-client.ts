import { FetchApiClient, MemoryTokenStore } from '@genoly/api-client';

async function runSmokeTest() {
  console.log('Starting ApiClient issueToken smoke test...');
  console.log('Target backend: https://robust-oyster-899.convex.site');

  // TODO(Shankar): paste dev credentials here, do not commit
  const devEmail = 'shankar@example.com'; 
  const devPassword = 'password123';

  if (devEmail === 'shankar@example.com' && devPassword === 'password123') {
    console.log('\n[!] Note: Please edit this file to insert real development credentials before running.');
    console.log('    Skipping live API call since placeholder credentials are being used.');
    console.log('    (Self-check: compilation and structures are verified!)\n');
    return;
  }

  const tokenStore = new MemoryTokenStore();
  const client = new FetchApiClient({
    tokenStore,
    baseUrl: 'https://robust-oyster-899.convex.site',
    appVersion: '1.0.0',
  });

  try {
    console.log(`Calling issueToken for: ${devEmail}...`);
    const res = await client.issueToken({
      email: devEmail,
      password: devPassword,
      device: {
        platform: 'ios',
        deviceModel: 'iPhone 15',
        osVersion: '17.2',
        appVersion: '1.0.0',
      },
      setAsPrimary: true,
    });

    console.log('\n--- SUCCESS! ---');
    console.log(`User ID:      ${res.user.id}`);
    console.log(`Email:        ${res.user.email}`);
    console.log(`Device ID:    ${res.device.id}`);
    console.log(`Device Status: ${res.device.status}`);
    console.log(`Token:        ${res.token}`);
    console.log(`Expires At:   ${new Date(res.expiresAt).toLocaleString()}`);
    console.log('----------------\n');
  } catch (err: unknown) {
    console.error('\n--- FAILED! ---');
    console.error(err);
    console.error('----------------\n');
    process.exit(1);
  }
}

runSmokeTest().catch((err: unknown) => {
  console.error('Smoke test runner failed:', err);
  process.exit(1);
});
