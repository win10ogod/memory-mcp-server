# Installation Troubleshooting

## Common Installation Issues

### Issue: `isolated-vm` compilation error on Windows

**Symptoms:**
```
npm error C1189: #error: "C++20 or later required."
npm error gyp ERR! build error
```

**Solution:** 
We've replaced `isolated-vm` with `vm2` to avoid native compilation issues. Please use the latest version of the package.

If you still see this error:
1. Delete `node_modules` folder
2. Delete `package-lock.json`
3. Run `npm install` again

```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: `@node-rs/jieba` fails to install

**Symptoms:**
```
npm error Failed to install @node-rs/jieba
```

**Solutions:**

1. **Ensure compatible Node.js version:**
   ```bash
   node --version  # Should be >= 18.0.0
   ```

2. **On Windows**, ensure you have Visual Studio Build Tools:
   - Download from: https://visualstudio.microsoft.com/downloads/
   - Install "Desktop development with C++"

3. **Try clearing npm cache:**
   ```bash
   npm cache clean --force
   npm install
   ```

4. **Use a prebuilt binary if available:**
   ```bash
   npm install @node-rs/jieba --force
   ```

### Issue: Permission errors (EPERM) on Windows

**Symptoms:**
```
npm warn cleanup Failed to remove some directories
Error: EPERM: operation not permitted
```

**Solutions:**

1. **Run as Administrator:**
   - Right-click PowerShell
   - Select "Run as Administrator"
   - Navigate to project directory
   - Run `npm install`

2. **Close all applications** that might be using node_modules:
   - Close VS Code, editors, terminals
   - Close Node.js processes in Task Manager
   - Try install again

3. **Use alternative location:**
   Move project to a simpler path (avoid special characters):
   ```bash
   # Instead of: I:\凌星開發計畫\GentianAphrodite\memory-mcp-server
   # Try: C:\projects\memory-mcp-server
   ```

### Issue: Node.js version too new (v24+)

**Symptoms:**
```
npm error C++20 or later required
```

**Solution:**
Use Node.js LTS version (recommended: v20.x or v22.x):

1. **Install Node Version Manager:**
   - **Windows**: Use `nvm-windows`
     ```bash
     nvm install 20
     nvm use 20
     ```
   - **Linux/Mac**: Use `nvm`
     ```bash
     nvm install 20
     nvm use 20
     ```

2. **Or download Node.js 20 LTS directly:**
   - https://nodejs.org/en/download/

### Issue: Chinese path causes problems

**Symptoms:**
Errors with path containing `凌星開發計畫` or other Chinese characters

**Solution:**
Move project to a path with only ASCII characters:

```bash
# Good paths:
C:\projects\memory-mcp-server
C:\dev\mcp\memory-server

# Avoid paths with:
# - Chinese characters
# - Spaces
# - Special characters
```

### Issue: `vm2` throws deprecation warning

**Symptoms:**
```
(node:xxxx) DeprecationWarning: vm.runInContext is deprecated
```

**Note:** This is expected and doesn't affect functionality. vm2 is maintained and works well for our use case.

## Installation Checklist

Before installing, ensure:

- [ ] Node.js version 18.0.0 or higher (check: `node --version`)
- [ ] npm version 8.0.0 or higher (check: `npm --version`)
- [ ] On Windows: Visual Studio Build Tools installed (for @node-rs/jieba)
- [ ] Project path contains only ASCII characters
- [ ] No other processes using node_modules folder
- [ ] Internet connection for downloading packages

## Clean Installation Steps

If you encounter persistent issues, try a clean installation:

```bash
# 1. Remove existing installations
rm -rf node_modules
rm package-lock.json

# 2. Clear npm cache
npm cache clean --force

# 3. Install dependencies
npm install

# 4. Test installation
node test-basic.js
```

## Alternative: Docker Installation

If native installation continues to fail, use Docker:

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "src/index.js"]
```

```bash
# Build and run
docker build -t memory-mcp-server .
docker run -v $(pwd)/data:/app/data memory-mcp-server
```

## Getting Help

If issues persist:

1. Check the error log: `C:\Users\{username}\AppData\Local\npm-cache\_logs\`
2. Create an issue with:
   - Full error message
   - Output of `node --version`
   - Output of `npm --version`
   - Your operating system
   - Installation command used

## Successful Installation Verification

After successful installation, verify:

```bash
# 1. Check installed packages
npm list --depth=0

# Should see:
# ├── @modelcontextprotocol/sdk@1.x.x
# ├── @node-rs/jieba@1.x.x
# ├── vm2@3.x.x
# └── zod@3.x.x

# 2. Run basic test
node test-basic.js

# Should output:
# 🧪 Running basic functionality tests...
# ✓ Jieba Keyword Extraction
# ...
# ✅ Basic functionality tests complete!
```

