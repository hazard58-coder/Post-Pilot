#!/usr/bin/env node

// Deployment monitoring script
const https = require('https');
const { execSync } = require('child_process');

const DEPLOYMENT_CHECKS = [
  {
    name: 'Application Health',
    check: async () => {
      const url = process.env.VERCEL_URL || 'http://localhost:3000';
      return await makeRequest(`${url}/health`);
    },
  },
  {
    name: 'API Endpoint',
    check: async () => {
      const url = process.env.VERCEL_URL || 'http://localhost:3000';
      return await makeRequest(`${url}/api/generate`, 'POST', {
        prompt: 'test',
        platform: 'test',
      });
    },
  },
  {
    name: 'Supabase Connection',
    check: async () => {
      // This would need actual Supabase client testing
      return { status: 'mock', message: 'Supabase connection check' };
    },
  },
];

async function makeRequest(url, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PostPilot-Deployment-Monitor/1.0',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          message: data,
          success: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        status: 'error',
        message: error.message,
        success: false,
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        status: 'timeout',
        message: 'Request timeout',
        success: false,
      });
    });

    req.end();
  });
}

async function runChecks() {
  console.log('🚀 Running deployment checks...\n');

  const results = [];
  let allPassed = true;

  for (const check of DEPLOYMENT_CHECKS) {
    console.log(`🔍 Checking ${check.name}...`);
    try {
      const result = await check.check();
      const passed = result.success;

      if (passed) {
        console.log(`   ✅ ${check.name}: PASSED`);
      } else {
        console.log(`   ❌ ${check.name}: FAILED (${result.status})`);
        if (result.message) {
          console.log(`      ${result.message}`);
        }
        allPassed = false;
      }

      results.push({ ...check, result, passed });
    } catch (error) {
      console.log(`   ❌ ${check.name}: ERROR - ${error.message}`);
      results.push({ ...check, result: { success: false, error: error.message }, passed: false });
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(50));

  if (allPassed) {
    console.log('\n🎉 All deployment checks passed!');
    console.log('   Application is ready for production use.');
    process.exit(0);
  } else {
    console.log('\n❌ Some deployment checks failed!');
    console.log('   Review the errors above before proceeding.');
    process.exit(1);
  }
}

if (require.main === module) {
  runChecks().catch((error) => {
    console.error('Deployment monitoring failed:', error);
    process.exit(1);
  });
}

module.exports = { runChecks, DEPLOYMENT_CHECKS };