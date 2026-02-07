# Azure Storage Sync Configuration

This document describes how to configure Azure Storage for automatic release file synchronization using a Blob SAS URL.

## Overview

The Hagicode Desktop project uses a GitHub Actions workflow (`sync-azure-storage.yml`) to automatically synchronize release assets to Azure Storage when a new release is published. This provides:

- **Redundant backup**: Files stored in both GitHub Releases and Azure Storage
- **CDN support**: Azure CDN can be configured for faster downloads
- **Geographic distribution**: Files available from Azure's global infrastructure

## Quick Setup (SAS URL Method)

The recommended method uses a single **Blob SAS URL** for authentication - no need to manage connection strings or access keys.

### 1. Create a Storage Account

If you don't already have an Azure Storage Account:

1. Go to the [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" and search for "Storage Account"
3. Configure the storage account:
   - **Subscription**: Choose your subscription
   - **Resource group**: Create or select an existing one
   - **Storage account name**: A globally unique name (e.g., `hagicodereleases`)
   - **Location**: Choose a region close to your users
   - **Performance**: Standard (recommended for release files)
   - **Redundancy**: LRS (Locally Redundant Storage) or GRS (Geo-Redundant Storage)
4. Click "Review + create", then "Create"

### 2. Create a Blob Container

After creating the storage account:

1. Navigate to your storage account in the Azure Portal
2. Under "Data storage", click "Containers"
3. Click "+ Container"
4. Enter a container name (e.g., `desktop-releases`)
5. Set the access level to "Private (no anonymous access)"
6. Click "Create"

### 3. Generate a Blob SAS URL

Generate a SAS URL for the container:

1. In your storage account, go to "Settings" → "Shared access signature"
2. Configure the SAS settings:
   - **Allowed services**: Blob only
   - **Resource type**: Container and Object
   - **Permissions**: Read, Write, Delete, List (minimum: Write, Create)
   - **Start and expiry date**: Set appropriate dates (e.g., 1 year or more)
3. Click "Generate SAS token and URL"
4. **Copy the Blob service SAS URL** - this is your `AZURE_BLOB_SAS_URL`

**Important**: The SAS URL format should be:
```
https://<account>.blob.core.windows.net/<container>?<sas-token>
```

Example:
```
https://mystorageaccount.blob.core.windows.net/desktop-releases?sp=rwdl&st=2024-01-01T00:00:00Z&se=2025-01-01T00:00:00Z&sv=2021-01-01&sr=c&sig=...
```

### 4. Configure GitHub Secret

Add the SAS URL as a GitHub secret:

1. Go to your repository on GitHub
2. Navigate to "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Name: `AZURE_BLOB_SAS_URL`
5. Value: Paste the SAS URL you copied
6. Click "Add secret"

**That's it!** Only one secret needs to be configured.

## File Organization

Files are organized in the Azure Storage container as follows:

```
desktop-releases/
├── index.json          # JSON index (auto-generated)
├── v1.0.0/
│   ├── Hagicode-Setup-1.0.0.exe
│   ├── Hagicode-1.0.0.dmg
│   ├── Hagicode-1.0.0.AppImage
│   ├── hagicode-desktop_1.0.0_amd64.deb
│   └── hagicode-desktop-1.0.0.tar.gz
└── v1.1.0/
    ├── Hagicode-Setup-1.1.0.exe
    └── ...
```

Each release creates a new directory named after its version tag.

### Auto-Generated Index

The workflow automatically generates an `index.json` file in the container root with the following structure:

```json
{
  "updatedAt": "2024-01-15T10:30:00Z",
  "versions": [
    {
      "version": "v1.1.0",
      "files": ["Hagicode-Setup-1.1.0.exe", "Hagicode-1.1.0.dmg", ...],
      "assets": [
        {
          "name": "Hagicode-Setup-1.1.0.exe",
          "path": "v1.1.0/Hagicode-Setup-1.1.0.exe",
          "size": 123456789,
          "lastModified": "2024-01-15T10:25:00Z"
        },
        ...
      ]
    },
    {
      "version": "v1.0.0",
      "files": ["Hagicode-Setup-1.0.0.exe", ...],
      "assets": [...]
    }
  ]
}
```

This JSON index provides:
- **Version list**: All available versions sorted newest first
- **File metadata**: Name, path, size, and last modified date for each file
- **Programmatic access**: Easy to consume by applications and update checkers

## Workflow Usage

### Automatic Trigger

The workflow automatically runs when a new release is published.

**Important**: This workflow is designed to run AFTER the main build workflow completes. The typical flow is:

1. Create and push a version tag (e.g., `git tag v1.0.0 && git push origin v1.0.0`)
2. The `build.yml` workflow is triggered and builds all platforms (Windows, macOS, Linux)
3. `build.yml` uploads all artifacts to the GitHub Release
4. When the release is marked as "published", this workflow triggers
5. This workflow downloads all release assets and syncs them to Azure Storage

**Note**: If you create a draft release or pre-release, this workflow will NOT trigger until you publish it as a full release.

### Manual Trigger

You can manually trigger the workflow to sync an existing release:

1. Go to "Actions" tab in your repository
2. Select "Sync Release to Azure Storage"
3. Click "Run workflow"
4. The workflow will sync the latest release

**Tip**: Manual trigger is useful for:
- Re-syncing an existing release to Azure Storage
- Testing the workflow configuration
- Syncing a specific release version

## CDN Configuration (Optional)

To configure Azure CDN for faster downloads:

1. In the Azure Portal, create a CDN profile
2. Create a CDN endpoint with your storage account as the origin
3. Configure caching rules as needed
4. Use the CDN endpoint URL for distributing download links

### Example CDN URL Format

```
https://<cdn-endpoint>.azureedge.net/<container-name>/<version>/<filename>
```

## Security Best Practices

1. **Use SAS URLs**: SAS URLs provide time-limited access with specific permissions
2. **Set appropriate expiry**: Choose a reasonable expiry date for your SAS token
3. **Limit permissions**: Only grant necessary permissions (Write, Create, List)
4. **Rotate tokens**: Regenerate SAS tokens periodically
5. **Monitor access**: Use Azure Monitor to track storage access
6. **Enable HTTPS only**: Ensure your storage account requires secure transfer

## Troubleshooting

### Workflow fails with "AZURE_BLOB_SAS_URL secret not found"

- Ensure you've added the `AZURE_BLOB_SAS_URL` secret to GitHub
- Check that the secret name matches exactly (case-sensitive)
- Verify the secret is in the repository (not organization) level

### Files are not uploaded

- Verify the storage account and container exist
- Check that the SAS URL has "Write" permission
- Ensure the SAS token hasn't expired
- Review the workflow logs for specific error messages

### Authentication error

- Verify the SAS URL format is correct
- Check that "Write" and "Create" permissions are granted
- Ensure the container name in the SAS URL matches your actual container

### Cannot access uploaded files

- The container is private by design
- Configure a CDN endpoint or generate SAS tokens for public access
- Use Azure Storage Explorer for manual file verification

## Alternative: Connection String Method

If you prefer using connection strings instead of SAS URLs:

1. In your storage account, go to "Settings" → "Access keys"
2. Copy the connection string
3. Add as GitHub secret: `AZURE_STORAGE_CONNECTION_STRING`

However, **SAS URL is recommended** for better security and simpler configuration.

## Additional Resources

- [Azure Storage Documentation](https://docs.microsoft.com/azure/storage/)
- [Create a SAS token](https://docs.microsoft.com/azure/storage/common/storage-sas-overview)
- [Azure CLI Documentation](https://docs.microsoft.com/cli/azure/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
