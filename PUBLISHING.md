# Publishing DSPyGround to NPM

## Pre-Publishing Checklist

### 1. Update Package Metadata
- [ ] Update version in `package.json`
- [ ] Update repository URL in `package.json`
- [ ] Verify author and license information
- [ ] Add homepage and bugs URLs

### 2. Test Locally

```bash
# Build the package
pnpm run build

# Test in a separate directory
mkdir /tmp/test-dspyground
cd /tmp/test-dspyground

# Link your local package
npm link /Users/karthikkalyanaraman/work/dspyground

# Test init
dspyground init

# Edit dspyground.config.ts with test tools

# Test dev
dspyground dev
```

### 3. Test Installation

```bash
# Create a test package
pnpm pack

# Install in a fresh directory
mkdir /tmp/test-install
cd /tmp/test-install
npm install /path/to/dspyground-0.1.0.tgz

# Test commands
npx dspyground init
npx dspyground dev
```

### 4. Verify Package Contents

```bash
# Check what will be published
pnpm pack --dry-run

# Verify these are included:
# - dist/cli/
# - templates/
# - src/
# - .next/ (after build)
# - public/
# - next.config.ts
# - tsconfig.json
```

## Publishing Steps

### Initial Setup (One Time)

```bash
# Login to npm
npm login

# Verify you're logged in
npm whoami
```

### Publish

```bash
# Ensure everything is built
pnpm run build

# Publish to npm
npm publish

# For beta/alpha releases
npm publish --tag beta
```

### Post-Publishing

```bash
# Test installation from npm
mkdir /tmp/test-npm
cd /tmp/test-npm
npm init -y
npx dspyground@latest init
npx dspyground dev
```

## Version Management

```bash
# Patch version (0.1.0 -> 0.1.1)
npm version patch

# Minor version (0.1.0 -> 0.2.0)
npm version minor

# Major version (0.1.0 -> 1.0.0)
npm version major
```

## Important Notes

1. **Environment Variables**: Users need `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY`
2. **Node Version**: Requires Node.js 18+
3. **Data Directory**: `.dspyground/` should be in `.gitignore`
4. **Python Optimizer**: Bundled in `python_optimizer/` directory

## Troubleshooting

### Issue: Missing files in published package
**Solution**: Check `files` array in `package.json`

### Issue: CLI command not found
**Solution**: Verify `bin` field in `package.json` and check file permissions

### Issue: Import errors
**Solution**: Ensure all dependencies are listed in `dependencies` not `devDependencies`

### Issue: Next.js build fails
**Solution**: Run `pnpm run build:server` separately to debug

## Unpublishing (Use with Caution)

```bash
# Unpublish a specific version (within 72 hours)
npm unpublish dspyground@0.1.0

# Unpublish entire package (only if < 72 hours old)
npm unpublish dspyground --force
```

## Beta/Alpha Releases

```bash
# Publish as beta
npm version prerelease --preid=beta
npm publish --tag beta

# Install beta
npx dspyground@beta init
```

## GitHub Release

After publishing to npm:

1. Create a git tag: `git tag v0.1.0`
2. Push tag: `git push origin v0.1.0`
3. Create GitHub release from tag
4. Add release notes

