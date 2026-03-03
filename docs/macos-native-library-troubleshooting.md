# macOS Native Library Troubleshooting Guide

This document provides troubleshooting information for macOS native library issues in HagiCode Desktop, particularly for Apple Silicon (ARM64) devices.

## Problem Overview

### Symptoms

On macOS ARM64 devices, the HagiCode Desktop application may fail to start with:

```
System.TypeInitializationException
  └── System.DllNotFoundException: Unable to load shared library 'libdl.so.2'
```

### Root Cause

LibGit2Sharp (0.31.0) does not have explicit dependency definitions for .NET 10 targets. The NuGet package manager cannot properly resolve which version of `LibGit2Sharp.NativeBinaries` to use, causing incorrect native library resolution on .NET 10.

### Impact

- **macOS ARM64**: Critical - application cannot start
- **macOS x64**: May have similar issues
- **Linux x64/ARM64**: Not affected
- **Windows x64**: Not affected

## Solution

### 1. Add Explicit NativeBinaries Dependency

The fix requires adding `LibGit2Sharp.NativeBinaries` as an explicit package reference.

#### In `repos/hagicode-core/Directory.Packages.props`:

Add the package version definition:

```xml
<ItemGroup>
  <PackageVersion Include="LibGit2Sharp" Version="0.31.0" />
  <PackageVersion Include="LibGit2Sharp.NativeBinaries" Version="2.0.323" />
  <!-- ... other packages ... -->
</ItemGroup>
```

#### In `repos/hagicode-core/src/PCode.DomainServices/PCode.DomainServices.csproj`:

Add the package reference:

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.Orleans.Core"/>
  <PackageReference Include="Volo.Abp.Core"/>
  <!-- ... other packages ... -->
  <PackageReference Include="LibGit2Sharp"/>
  <PackageReference Include="LibGit2Sharp.NativeBinaries"/>
  <PackageReference Include="YamlDotNet"/>
</ItemGroup>
```

### 2. Restore Packages

After updating the package references:

```bash
cd repos/hagicode-core
dotnet restore
```

### 3. Verify Package Resolution

Verify that both packages are resolved correctly:

```bash
cd src/PCode.DomainServices
dotnet list package --include-transitive | grep -i libgit2
```

Expected output:

```
> LibGit2Sharp                                               0.31.0      0.31.0
> LibGit2Sharp.NativeBinaries                                2.0.323     2.0.323
```

### 4. Verify Native Libraries

After building, verify that the native libraries are present in the NuGet cache:

```bash
# Check osx-arm64 native library exists
ls ~/.nuget/packages/libgit2sharp.nativebinaries/2.0.323/runtimes/osx-arm64/native/

# Should show: libgit2-3f4182d.dylib
```

## Native Library Structure

LibGit2Sharp.NativeBinaries 2.0.323 provides native libraries for all supported platforms:

```
runtimes/
├── osx-arm64/native/libgit2-*.dylib    # Apple Silicon
├── osx-x64/native/libgit2-*.dylib        # Intel Mac
├── linux-x64/native/libgit2.so.1.7      # Linux x64
├── linux-arm64/native/libgit2.so.1.7    # Linux ARM64
└── win-x64/native/git2-1.7.dll          # Windows
```

## Verification

### Using the Verification Script

The project includes a script to verify native library packaging:

```bash
cd repos/hagicode-desktop

# Verify for current platform
npm run verify:libs

# Verify with verbose output
npm run verify:libs:verbose

# Verify specific platform
node scripts/verify-native-libs.js --platform osx-arm64
```

### Expected Verification Results

- ✓ **Pass**: Native libraries found in expected locations
- ⚠️ **Warning**: No native libraries found (may be expected for partial builds)
- ✗ **Fail**: Missing required libraries

## Build Configuration

### electron-builder.yml

Ensure macOS ARM64 is properly configured:

```yaml
mac:
  target:
    - target: default
      arch:
        - x64
        - arm64    # Apple Silicon support
  icon: resources/icon.icns
  category: public.app-category.utilities

# Important: Unpack native libraries from asar
asarUnpack:
  - '**/node_modules/**/{*.node,dll/*.dll,*.dylib}'
  - '**/vendor/**'
```

## Additional Troubleshooting

### Issue: Application Still Fails After Fix

1. **Clear NuGet cache**:
   ```bash
   rm -rf ~/.nuget/packages/libgit2sharp.nativebinaries
   dotnet restore
   ```

2. **Clean build output**:
   ```bash
   rm -rf bin/obj/
   dotnet build
   ```

3. **Check for multiple versions**:
   ```bash
   dotnet list package --include-transitive | grep -i "nativebinaries"
   ```
   Only version 2.0.323 should appear.

### Issue: Verification Shows Missing Libraries

1. **Check build configuration**: Verify `asarUnpack` includes `*.dylib`
2. **Rebuild**: Run a clean build: `npm run build:prod`
3. **Check output path**: Verify the correct output directory is being checked

### Issue: Wrong Platform Libraries Loaded

If Linux libraries are loading on macOS:

1. Verify `RuntimeIdentifier` is correct for the build
2. Check that explicit NativeBinaries dependency is working
3. Rebuild with clean state

## Prevention

### CI/CD Verification

To prevent future regressions, integrate native library verification into CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Verify Native Libraries
  run: |
    cd repos/hagicode-desktop
    npm run verify:libs -- --platform osx-arm64
```

### Documentation

Keep this document updated when:
- Package versions change
- Build configuration changes
- New platforms are added
- New native library dependencies are introduced

## Resources

- [LibGit2Sharp Repository](https://github.com/libgit2/libgit2sharp)
- [LibGit2Sharp.NativeBinaries Package](https://www.nuget.org/packages/LibGit2Sharp.NativeBinaries)
- [.NET Native Library Loading](https://learn.microsoft.com/en-us/dotnet/core/compatibility/native-loading)
- [Development Guide](./development.md)
