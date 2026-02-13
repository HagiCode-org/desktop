#!/usr/bin/env node

/**
 * Code Signing Script
 *
 * This script signs Windows executables and packages using Azure Artifact Signing.
 * It's designed to run in CI/CD environments and supports multiple signing methods.
 *
 * Usage:
 *   node scripts/sign-artifact.js <file-path>
 *
 * Environment Variables:
 *   AZURE_CLIENT_ID          - Azure service principal client ID (required)
 *   AZURE_CLIENT_SECRET      - Azure service principal client secret (required)
 *   AZURE_TENANT_ID          - Azure tenant ID (required)
 *   AZURE_SIGNING_ENDPOINT   - Azure Artifact Signing endpoint (optional)
 *   AZURE_SIGNING_KEY_URI    - Azure Key Vault key URI (optional)
 *   ENABLE_CODE_SIGNING      - Enable/disable signing (default: false)
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Signing failed
 *   2 - Invalid arguments
 *   3 - Missing environment variables
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Configuration from environment variables
 */
const config = {
  azureClientId: process.env.AZURE_CLIENT_ID,
  azureClientSecret: process.env.AZURE_CLIENT_SECRET,
  azureTenantId: process.env.AZURE_TENANT_ID,
  azureSigningEndpoint: process.env.AZURE_SIGNING_ENDPOINT,
  azureSigningKeyUri: process.env.AZURE_SIGNING_KEY_URI,
  enableSigning: process.env.ENABLE_CODE_SIGNING === 'true',
};

/**
 * Log messages with optional colors
 */
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Log CI-specific information
 */
function logCI(message, type = 'info') {
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  if (isGitHubActions) {
    switch (type) {
      case 'error':
      log(`::error::${message}`, colors.red);
      break;
      case 'warning':
      log(`::warning::${message}`, colors.yellow);
      break;
      case 'notice':
      log(`::notice::${message}`, colors.blue);
      break;
      case 'group':
      log(`::group::${message}`, colors.cyan);
      break;
      case 'endgroup':
      log('::endgroup::');
      break;
      default:
      log(message);
    }
  } else {
    log(message);
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node scripts/sign-artifact.js <file-path>

Arguments:
  file-path              Path to the file to sign (required)

Environment Variables:
  AZURE_CLIENT_ID        Azure service principal client ID (required)
  AZURE_CLIENT_SECRET    Azure service principal client secret (required)
  AZURE_TENANT_ID        Azure tenant ID (required)
  AZURE_SIGNING_ENDPOINT Azure Artifact Signing endpoint (optional)
  AZURE_SIGNING_KEY_URI  Azure Key Vault key URI (optional)
  ENABLE_CODE_SIGNING    Enable/disable signing (default: false)

Description:
  This script signs Windows executables and packages using Azure Artifact Signing.
  It's designed to run in CI/CD environments and supports Authenticode signing.

Examples:
  # Sign an executable
  node scripts/sign-artifact.exe

  # Sign an AppX package
  node scripts/sign-artifact.js "Hagicode Desktop 1.0.0.appx"

Exit Codes:
  0 - Success
  1 - Signing failed
  2 - Invalid arguments
  3 - Missing environment variables
`);
}

/**
 * Validate environment configuration
 */
function validateConfig() {
  const errors = [];

  if (!config.azureClientId) {
    errors.push('AZURE_CLIENT_ID is not set');
  }

  if (!config.azureClientSecret) {
    errors.push('AZURE_CLIENT_SECRET is not set');
  }

  if (!config.azureTenantId) {
    errors.push('AZURE_TENANT_ID is not set');
  }

  return errors;
}

/**
 * Check if Azure CLI is available
 */
async function checkAzureCLI() {
  return new Promise((resolve) => {
    const child = spawn('az', ['--version'], { stdio: 'pipe' });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Login to Azure using service principal
 */
async function loginToAzure() {
  logCI('Logging into Azure...', 'info');

  const args = [
    'login',
    '--service-principal',
    '--user', config.azureClientId,
    '--password', config.azureClientSecret,
    '--tenant', config.azureTenantId,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('az', args, { stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        logCI('Azure login successful', 'info');
        resolve(stdout);
      } else {
        reject(new Error(`Azure login failed: ${stderr || stdout}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Sign a file using Azure Artifact Signing
 */
async function signWithAzure(filePath) {
  logCI(`Signing artifact: ${filePath}`, 'info');

  // Determine signing method based on available configuration
  if (config.azureSigningEndpoint) {
    return signWithAzureTrustedSigning(filePath);
  } else if (config.azureSigningKeyUri) {
    return signWithAzureKeyVault(filePath);
  } else {
    // Use signtool with certificate from environment (fallback)
    return signWithSignTool(filePath);
  }
}

/**
 * Sign using Azure Trusted Signing service
 */
async function signWithAzureTrustedSigning(filePath) {
  logCI('Using Azure Trusted Signing service', 'info');

  const args = [
    'artifacts',
    'signing',
    'sign',
    '--endpoint', config.azureSigningEndpoint,
    '--file', filePath,
    '--hash-algorithm', 'SHA256',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('az', args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        logCI(`Successfully signed: ${path.basename(filePath)}`, 'info');
        resolve();
      } else {
        reject(new Error(`Azure Trusted Signing failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Sign using Azure Key Vault
 */
async function signWithAzureKeyVault(filePath) {
  logCI('Using Azure Key Vault signing', 'info');

  const args = [
    'keyvault',
    'sign',
    '--vault-uri', config.azureSigningKeyUri.split('/secrets/')[0],
    '--name', path.basename(filePath, path.extname(filePath)),
    '--file', filePath,
    'SHA256',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('az', args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        logCI(`Successfully signed: ${path.basename(filePath)}`, 'info');
        resolve();
      } else {
        reject(new Error(`Azure Key Vault signing failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Sign using Windows signtool (fallback)
 */
async function signWithSignTool(filePath) {
  logCI('Using signtool for signing', 'info');

  // Check for certificate file
  const certFile = process.env.WIN_CREDENTIAL_FILE;
  const certPassword = process.env.WIN_CREDENTIAL_PASSWORD;

  if (!certFile) {
    throw new Error('No signing method available. Set AZURE_SIGNING_ENDPOINT or AZURE_SIGNING_KEY_URI, or provide WIN_CREDENTIAL_FILE');
  }

  // Find signtool.exe
  const programFiles = process.env.ProgramFiles || 'C:\\\\Program Files';
  const signToolPath = path.join(programFiles, 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe');

  if (!fs.existsSync(signToolPath)) {
    throw new Error(`signtool.exe not found at: ${signToolPath}`);
  }

  const args = [
    'sign',
    '/f', certFile,
    '/p', certPassword,
    '/fd', 'SHA256',
    '/td', 'SHA256',
    '/tr', 'http://timestamp.digicert.com',
    filePath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(signToolPath, args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        logCI(`Successfully signed: ${path.basename(filePath)}`, 'info');
        resolve();
      } else {
        reject(new Error(`signtool failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Validate arguments
  if (args.length === 0) {
    logCI('No file path provided', 'error');
    showHelp();
    process.exit(2);
  }

  const filePath = args[0];

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    logCI(`File not found: ${filePath}`, 'error');
    process.exit(2);
  }

  // Check if code signing is enabled
  if (!config.enableSigning) {
    logCI('Code signing is disabled (ENABLE_CODE_SIGNING != true)', 'notice');
    process.exit(0);
  }

  // Validate configuration
  const configErrors = validateConfig();
  if (configErrors.length > 0) {
    logCI('Configuration errors:', 'error');
    for (const error of configErrors) {
      log(`  - ${error}`, colors.red);
    }
    process.exit(3);
  }

  // Check for Azure CLI
  const hasAzureCLI = await checkAzureCLI();
  if (!hasAzureCLI) {
    logCI('Azure CLI not found. Installing...', 'warning');
    // Could add Azure CLI installation here if needed
    logCI('Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli', 'error');
    process.exit(1);
  }

  try {
    // Login to Azure
    await loginToAzure();

    // Sign the file
    await signWithAzure(filePath);

    logCI('Code signing completed successfully', 'info');
    process.exit(0);

  } catch (error) {
    logCI(`Code signing failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
